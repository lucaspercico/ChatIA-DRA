/***************************************************
 * Chat DRA com Gemini Flash + Embeddings Cache
 * Autor: Lucas + I.A
 * Pipeline RAG:
 *   Ler e Limpar          getKnowledgeBaseAndTimestamp
 *   Traduzir para Números  recuperarOuGerarEmbeddings
 *   Decidir o relevante    encontrarContextoRelevante
 *   Montar e Enviar        responderPergunta / fetchWithRetry
 ***************************************************/

/** CONFIGURAÇÕES */

const props = PropertiesService.getScriptProperties();
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');

const EMBEDDING_MODEL = 'models/gemini-embedding-001';

const GENERATIVE_MODEL = 'models/gemini-2.5-flash'; 

// --- CONFIGURAÇÕES DE ARQUIVOS DO DRIVE ---
const DRIVE_FOLDER_NAME = "I.A conhecimento";
const KNOWLEDGE_FILE_NAME = "conhecimento";
const LOGO_FILE_NAME = "logo.png"; 
const BACKGROUND_FILE_NAME = "background.png"; 
const AVATAR_AI_FILE_NAME = "i.a.png"; 

// Persiste os vetores de embedding no Drive para não regenerá-los a cada deploy
const EMBEDDINGS_FILE_NAME = "embeddings_v2.json";

// --- CONFIGURAÇÃO DO GOOGLE SHEETS PARA LOGS ---
// Crie uma Planilha com duas abas: "Perguntas_Falhas" e "Feedbacks"
// Cole o ID da planilha (código na URL do navegador) abaixo:
const SPREADSHEET_LOG_ID = props.getProperty('SPREADSHEET_LOG_ID') || '';

// --- CHAVES DO CACHESERVICE (nomes curtos = menos overhead) ---
const CACHE_TTL           = 21600; // 6 horas
const CACHE_FOLDER_ID     = 'kf_folder_id';
const CACHE_KB_FILE_ID    = 'kf_file_id';
const CACHE_KB_TIMESTAMP  = 'knowledge_base_last_updated'; // mantido para compatibilidade
const CACHE_KB_TEXT       = 'knowledge_base_text';         // mantido para compatibilidade
const CACHE_EMB_FILE_ID   = 'emb_file_id';
const CACHE_EMB_META      = 'emb_meta';
const CACHE_EMB_PAGE_PFX  = 'emb_p_';
// Máximo de chunks por página de cache (cada página deve ficar abaixo de 100 KB)
// text-embedding-004 = 768 floats ≈ 9 KB/vetor + ~1.5 KB de texto ≈ 11 KB/chunk
const EMB_CHUNKS_PER_PAGE = 9; // 5 × 11 KB ≈ 55 KB — margem segura


/***************************************************
 *  FUNÇÕES AUXILIARES
 ***************************************************/

function chunkText(text, maxLength = 3000, overlap = 200) {
  if (!text) return [];
  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxLength;

    if (endIndex < text.length) {
      // Tenta quebrar em um parágrafo
      let breakPoint = text.lastIndexOf('\n\n', endIndex);

      // Se não achar parágrafo, tenta quebrar em um ponto final
      if (breakPoint <= startIndex) {
        breakPoint = text.lastIndexOf('. ', endIndex);
      }

      // Se não achar ponto final, quebra no último espaço vazio
      if (breakPoint <= startIndex) {
        breakPoint = text.lastIndexOf(' ', endIndex);
      }

      if (breakPoint > startIndex) {
        endIndex = breakPoint + 1;
      }
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk) chunks.push(chunk);

    startIndex = endIndex - overlap;

    if (endIndex >= text.length) break;

    if (startIndex <= endIndex - maxLength) {
      startIndex = endIndex;
    }
  }
  return chunks;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  if (!a || !b || a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError = null;
  for (let i = 0; i < maxRetries; i++) {
    let response; // Declarado aqui para estar no escopo do try/catch
    try {
      response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      
      
      const rawResponse = response.getContentText();

      // Se for sucesso, PARSEAMOS o JSON e retornamos
      if (responseCode >= 200 && responseCode < 300) {
        try {
          
          return JSON.parse(rawResponse);
        } catch (parseError) {
          // Se a API der 200, mas enviar um JSON inválido
          Logger.log(`Tentativa ${i + 1} falhou no PARSE do JSON: ${parseError}. Resposta: ${rawResponse}`);
          lastError = parseError;
          // Continua para a próxima tentativa
        }
      }

      // Se for um erro (não 200-299), o código abaixo executa
      Logger.log(`Tentativa ${i + 1}/${maxRetries} falhou. Código: ${responseCode}. Resposta: ${rawResponse}`);
      
      if (responseCode === 429 || responseCode === 503 || rawResponse.toLowerCase().includes("overloaded")) {
        lastError = new Error(`Erro recuperável (${responseCode}): ${rawResponse}`);
        const sleepTime = Math.pow(2, i) * 1000 + (Math.random() * 1000); 
        Utilities.sleep(sleepTime);
      } else {
        lastError = new Error(`Erro não recuperável (${responseCode}): ${rawResponse}`);
        break; 
      }

    } catch (e) {
      // Captura erros de rede, DNS, etc.
      lastError = e;
      Logger.log(`Tentativa ${i + 1}/${maxRetries} falhou com exceção: ${e}`);
      const sleepTime = Math.pow(2, i) * 1000 + (Math.random() * 1000); 
      Utilities.sleep(sleepTime);
    }
  }
  
  Logger.log("Falha em todas as tentativas de fetch.");
  throw lastError || new Error("Falha ao buscar a API após várias tentativas.");
}


/***************************************************
 *  EMBEDDINGS (VETORIZAÇÃO DE TEXTO)
 ***************************************************/

function generateEmbedding(text) {
  if (!text || !GEMINI_API_KEY) {
    Logger.log("❌ Erro: Texto vazio ou GEMINI_API_KEY não configurada nas Propriedades do Script.");
    return [];
  }


  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({ content: { parts: [{ text: text }] } }),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());

    if (data.error) {
      Logger.log(`❌ Erro na API (Bloco de texto): ${data.error.message}`);
      return [];
    }
    
    return data?.embedding?.values || [];
  } catch (e) {
    Logger.log("❌ Falha na chamada de embedding: " + e);
    return [];
  }
}

/***************************************************
 *  LÓGICA DO GOOGLE DRIVE
 ***************************************************/

function getKnowledgeFolder() {
  const cache = CacheService.getScriptCache();
  const cachedId = cache.get(CACHE_FOLDER_ID);
  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId); // getFolderById é muito mais rápido que getFoldersByName
    } catch (e) {
      cache.remove(CACHE_FOLDER_ID); // ID ficou inválido (pasta deletada/movida)
    }
  }
  try {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      cache.put(CACHE_FOLDER_ID, folder.getId(), CACHE_TTL);
      return folder;
    }
    Logger.log(`❌ Pasta não encontrada: ${DRIVE_FOLDER_NAME}`);
    return null;
  } catch (e) {
    Logger.log(`❌ Erro ao acessar o Drive: ${e}. Verifique as permissões.`);
    return null;
  }
}

function getImageData(fileName) {
  if (!fileName) {
    Logger.log("❌ Tentativa de buscar imagem com nome de arquivo nulo.");
    return null;
  }
  try {
    const folder = getKnowledgeFolder(); 
    if (!folder) {
      Logger.log(`❌ Não foi possível buscar a imagem "${fileName}", pasta de conhecimento não encontrada.`);
      return null;
    }
    
    const files = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      const file = files.next();
      const blob = file.getBlob();
      const contentType = blob.getContentType();
      const base64 = Utilities.base64Encode(blob.getBytes());
      
      Logger.log(`✅ Imagem "${fileName}" encontrada e codificada.`);
      return { base64: base64, contentType: contentType };
    } else {
      Logger.log(`⚠️ ERRO CRÍTICO: Imagem "${fileName}" NÃO encontrada na pasta "${DRIVE_FOLDER_NAME}". Verifique o nome do arquivo.`);
      return null;
    }
  } catch (e) {
    Logger.log(`❌ Erro ao buscar/codificar a imagem "${fileName}": ${e}`);
    return null;
  }
}


function getKnowledgeBaseAndTimestamp() {
  const cache = CacheService.getScriptCache();
  const folder = getKnowledgeFolder();
  if (!folder) return { text: null, timestamp: null };

  let file = null;
  const cachedFileId = cache.get(CACHE_KB_FILE_ID);
  
  if (cachedFileId) {
    try {
      file = DriveApp.getFileById(cachedFileId);
    } catch (e) {
      cache.remove(CACHE_KB_FILE_ID);
    }
  }

  if (!file) {
    const files = folder.getFilesByName(KNOWLEDGE_FILE_NAME);
    if (!files.hasNext()) {
      Logger.log(`❌ Arquivo não encontrado: ${KNOWLEDGE_FILE_NAME} na pasta ${DRIVE_FOLDER_NAME}`);
      return { text: null, timestamp: null };
    }
    file = files.next();
    cache.put(CACHE_KB_FILE_ID, file.getId(), CACHE_TTL);
  }

  const fileLastUpdated = file.getLastUpdated().toISOString();
  const cachedTimestamp = cache.get(CACHE_KB_TIMESTAMP);

  if (fileLastUpdated !== cachedTimestamp) {
    Logger.log("🔄 Google Doc alterado. Extraindo novo texto e atualizando o cache...");
    
    
    const doc = DocumentApp.openById(file.getId());
    const fileContent = doc.getBody().getText(); 
    // ---------------------------

    cache.put(CACHE_KB_TEXT, fileContent, CACHE_TTL);
    cache.put(CACHE_KB_TIMESTAMP, fileLastUpdated, CACHE_TTL);
    return { text: fileContent, timestamp: fileLastUpdated };
  }

  return { text: cache.get(CACHE_KB_TEXT), timestamp: cachedTimestamp };
}

function registrarPerguntaSemResposta(pergunta, historico, respostaIA) {
  try {
    // 1. Garantia de ID: Busca novamente se estiver vazio
    let sheetId = SPREADSHEET_LOG_ID;
    if (!sheetId) {
      sheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_LOG_ID');
    }

    if (!sheetId) {
      Logger.log("❌ Erro: SPREADSHEET_LOG_ID não definido.");
      return;
    }

    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Perguntas_Falhas');
    if (!sheet) {
      Logger.log("Aba 'Perguntas_Falhas' não encontrada.");
      return;
    }

    // 2. Map seguro para evitar erros de 'undefined'
    let historicoFormatado = "Sem histórico";
    if (Array.isArray(historico) && historico.length > 0) {
      historicoFormatado = historico
        .map(item => {
          try {
            const role = item.role === 'user' ? 'Usuário' : 'IA';
            const texto = (item.parts && item.parts[0] && item.parts[0].text) ? item.parts[0].text : "[Conteúdo Vazio]";
            return `${role}: ${texto}`;
          } catch (e) { return "Erro no item do histórico"; }
        })
        .join('\n---\n');
    }

    // 3. Garantia de Strings (evita problemas com objetos brutos)
    const row = [
      new Date(), 
      String(pergunta || ""), 
      String(respostaIA || ""), 
      String(historicoFormatado).substring(0, 30000) // Limite de célula do Sheets
    ];

    sheet.appendRow(row);
    Logger.log("📝 Falha registrada com sucesso.");
  } catch (e) {
    Logger.log(`❌ Erro FATAL no registro: ${e.message}`);
  }
}


/**
 * Registra o feedback do usuário (like/dislike) no Google Sheets.
 */
function registrarFeedback(pergunta, resposta, feedback) {
  try {
    if (feedback === 'like') return; // Ignora likes para reduzir uso de armazenamento

    const sheet = SpreadsheetApp.openById(SPREADSHEET_LOG_ID).getSheetByName('Feedbacks');
    if (!sheet) {
      Logger.log("Aba 'Feedbacks' não encontrada na planilha.");
      return;
    }

    // Grava: [Data/Hora, Tipo (Dislike), Pergunta, Resposta]
    sheet.appendRow([new Date(), feedback, pergunta, resposta]);
    Logger.log("📝 Feedback salvo no Sheets com sucesso.");
  } catch (e) {
    Logger.log(`❌ Erro ao registrar feedback no Sheets: ${e}`);
  }
}

/***************************************************
 * LÓGICA PRINCIPAL DO CHAT
 ***************************************************/

/**
 * Carrega embeddings do CacheService. Retorna null em caso de cache miss.
 * Os chunks são distribuídos em várias chaves para contornar o limite de 100 KB por entrada.
 */
function carregarEmbeddingsDoCache(fileTimestamp) {
  try {
    const cache = CacheService.getScriptCache();
    const metaStr = cache.get(CACHE_EMB_META);
    if (!metaStr) return null;
    const meta = JSON.parse(metaStr);
    if (!meta || meta.timestamp !== fileTimestamp || !meta.totalPages) return null;
    const allChunks = [];
    for (let i = 0; i < meta.totalPages; i++) {
      const pageStr = cache.get(CACHE_EMB_PAGE_PFX + i);
      if (!pageStr) return null; // Página expirou — cache miss total
      allChunks.push(...JSON.parse(pageStr));
    }
    Logger.log(`✅ ${allChunks.length} embeddings carregados do CacheService.`);
    return allChunks;
  } catch (e) {
    Logger.log(`⚠️ Erro ao carregar embeddings do cache: ${e}`);
    return null;
  }
}

/**
 * Persiste embeddings no CacheService dividindo em páginas de até EMB_CHUNKS_PER_PAGE chunks.
 * Falha silenciosa: se o cache não aceitar, o sistema continua lendo do Drive normalmente.
 */
function salvarEmbeddingsNoCache(fileTimestamp, chunks) {
  try {
    const cache = CacheService.getScriptCache();
    const totalPages = Math.ceil(chunks.length / EMB_CHUNKS_PER_PAGE);
    // Salva meta primeiro: se uma página falhar, a próxima leitura detecta a inconsistência
    cache.put(CACHE_EMB_META, JSON.stringify({ timestamp: fileTimestamp, totalPages }), CACHE_TTL);
    for (let i = 0; i < totalPages; i++) {
      const page = chunks.slice(i * EMB_CHUNKS_PER_PAGE, (i + 1) * EMB_CHUNKS_PER_PAGE);
      cache.put(CACHE_EMB_PAGE_PFX + i, JSON.stringify(page), CACHE_TTL);
    }
    Logger.log(`✅ ${chunks.length} embeddings salvos no CacheService em ${totalPages} página(s).`);
  } catch (e) {
    Logger.log(`⚠️ Não foi possível salvar embeddings no CacheService: ${e}`);
  }
}

/**
 * Retorna os chunks com embeddings usando a seguinte hierarquia de velocidade:
 *   1. CacheService (mais rápido, sem I/O de Drive)
 *   2. Arquivo JSON no Drive   (lento, mas persiste entre instâncias)
 *   3. Geração via Gemini API  (só acontece quando o conhecimento muda)
 */
/**
 * Retorna os chunks com embeddings usando a seguinte hierarquia:
 * 1. CacheService | 2. Arquivo JSON no Drive | 3. Geração via Gemini API
 */
function recuperarOuGerarEmbeddings(folder, fullText, fileTimestamp) {
  const cache = CacheService.getScriptCache();

  // 1. Verifica o CacheService
  const cachedChunks = carregarEmbeddingsDoCache(fileTimestamp);
  if (cachedChunks) return cachedChunks;

  // 2. Tenta localizar o arquivo JSON no Drive
  let existingFile = null;
  const cachedFileId = cache.get(CACHE_EMB_FILE_ID);
  if (cachedFileId) {
    try { 
      existingFile = DriveApp.getFileById(cachedFileId); 
    } catch (e) { 
      cache.remove(CACHE_EMB_FILE_ID); 
    }
  }
  
  if (!existingFile) {
    const files = folder.getFilesByName(EMBEDDINGS_FILE_NAME);
    if (files.hasNext()) {
      existingFile = files.next();
      cache.put(CACHE_EMB_FILE_ID, existingFile.getId(), CACHE_TTL);
    }
  }

  if (existingFile) {
    try {
      const data = JSON.parse(existingFile.getBlob().getDataAsString('UTF-8'));
      if (data.timestamp === fileTimestamp && data.chunks && data.chunks.length > 0) {
        Logger.log(`✅ ${data.chunks.length} embeddings carregados do Drive.`);
        salvarEmbeddingsNoCache(fileTimestamp, data.chunks);
        return data.chunks;
      }
      Logger.log("🔄 Documento desatualizado. Removendo JSON antigo...");
      existingFile.setTrashed(true);
      cache.remove(CACHE_EMB_FILE_ID);
    } catch (e) {
      Logger.log(`⚠️ Erro ao ler JSON: ${e}`);
    }
  }

  // 3. Geração de Novos Embeddings (Versão Estável com Logs)
  const chunks = chunkText(fullText);
  const baseDeDados = [];
  
  Logger.log(`🔨 Iniciando geração para ${chunks.length} blocos...`);

  for (let i = 0; i < chunks.length; i++) {
    // Log de progresso ANTES da chamada para você saber o que está sendo processado
    Logger.log(`⏳ Chamando API para Bloco ${i + 1} de ${chunks.length}...`);

    if (i > 0) Utilities.sleep(800); // Pausa para evitar limite de quota
    
    try {
      // Chamada da API isolada para não travar o loop em caso de erro único
      const vetor = generateEmbedding(chunks[i]);
      
      if (vetor && vetor.length > 0) {
        baseDeDados.push({ text: chunks[i], embedding: vetor });
      } else {
        Logger.log(`⚠️ Bloco ${i + 1} ignorado (vetor vazio).`);
      }
    } catch (e) {
      Logger.log(`❌ Erro no bloco ${i + 1}: ${e}`);
    }
  }

  // --- SALVAMENTO ROBUSTO ---
  if (baseDeDados.length > 0) {
    try {
      Logger.log("💾 Gravando banco de dados de embeddings no Drive...");
      const payload = { 
        timestamp: fileTimestamp, 
        chunks: baseDeDados,
        info: "Gerado em " + new Date().toLocaleString()
      };
      
      const jsonString = JSON.stringify(payload);
      const newFile = folder.createFile(EMBEDDINGS_FILE_NAME, jsonString, MimeType.PLAIN_TEXT); 
      
      // Atualiza cache com o novo arquivo
      cache.put(CACHE_EMB_FILE_ID, newFile.getId(), CACHE_TTL);
      salvarEmbeddingsNoCache(fileTimestamp, baseDeDados);
      
      Logger.log(`✅ SUCESSO! Arquivo "${EMBEDDINGS_FILE_NAME}" criado.`);
      return baseDeDados;
    } catch (e) {
      Logger.log(`❌ ERRO AO SALVAR NO DRIVE: ${e}`);
    }
  } else {
    Logger.log("❌ Falha crítica: Nenhum embedding foi gerado.");
  }

  return baseDeDados;
}

function encontrarContextoRelevante(pergunta) {
  // 1. Gera o embedding da PERGUNTA (Isso sempre é necessário)
  const perguntaEmbedding = generateEmbedding(pergunta);
  if (!perguntaEmbedding || perguntaEmbedding.length === 0) {
    return { contextos: ["Erro ao analisar a pergunta (Falha no Embedding)."], maiorSimilaridade: -1 };
  }
  
  // 2. Carrega a base de conhecimento
  const knowledgeData = getKnowledgeBaseAndTimestamp();
  if (!knowledgeData.text) {
    return { contextos: ["Erro: Base de conhecimento não encontrada."], maiorSimilaridade: -1 };
  }

  const folder = getKnowledgeFolder();
  if (!folder) {
     return { contextos: ["Erro: Pasta do Drive não acessível."], maiorSimilaridade: -1 };
  }

  // MÁGICA: Busca os chunks já prontos do Drive (ou gera se for novo)
  // Removemos a lógica antiga de CacheService daqui e delegamos para a nova função
  const chunksComVector = recuperarOuGerarEmbeddings(folder, knowledgeData.text, knowledgeData.timestamp);

  if (!chunksComVector || chunksComVector.length === 0) {
     return { contextos: ["Erro: Não foi possível gerar ou recuperar os embeddings do texto."], maiorSimilaridade: -1 };
  }

  // 4. Calcula a similaridade (Matemática pura, muito rápido localmente)
  const TOP_K = 4; // Aumentado de 3 para 6 para dar mais contexto à IA
  const SIMILARITY_THRESHOLD_FOR_RETRIEVAL = 0.25; // Reduzido de 0.3 para ser um pouco mais flexível na busca
  
  const allSimilarities = chunksComVector.map(item => {
    return {
      chunk: item.text,
      similaridade: cosineSimilarity(perguntaEmbedding, item.embedding)
    };
  });

  // 5. Ordena e filtra
  allSimilarities.sort((a, b) => b.similaridade - a.similaridade);
  
  const topChunks = allSimilarities
    .filter(item => item.similaridade >= SIMILARITY_THRESHOLD_FOR_RETRIEVAL)
    .slice(0, TOP_K);

  if (topChunks.length === 0) {
      const maiorSim = allSimilarities.length > 0 ? allSimilarities[0].similaridade : -1;
      return { contextos: [], maiorSimilaridade: maiorSim };
  }
  
  const contextos = topChunks.map(item => item.chunk);
  const maiorSimilaridade = topChunks[0].similaridade;
  
  Logger.log(`Retorn