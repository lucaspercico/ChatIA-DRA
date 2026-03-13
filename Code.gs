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

const EMBEDDING_MODEL = 'models/text-embedding-004';


const GENERATIVE_MODEL = 'models/gemini-flash-latest'; 

// --- CONFIGURAÇÕES DE ARQUIVOS DO DRIVE ---
const DRIVE_FOLDER_NAME = "I.A conhecimento";
const KNOWLEDGE_FILE_NAME = "conhecimento.txt";
const REPORT_FILE_NAME = "Relatorio_Perguntas_Nao_Respondidas.txt";
const LOGO_FILE_NAME = "logo.png"; 


const BACKGROUND_FILE_NAME = "background.png"; // Seu arquivo se chama "fundo.png"
const AVATAR_AI_FILE_NAME = "i.a.png"; 


const REPORT_FEEDBACK_FILE_NAME = "Relatorio_Feedback_IA.txt";
// Persiste os vetores de embedding no Drive para não regenerá-los a cada deploy
const EMBEDDINGS_FILE_NAME = "embeddings_db.json";

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
const EMB_CHUNKS_PER_PAGE = 5; // 5 × 11 KB ≈ 55 KB — margem segura


/***************************************************
 *  FUNÇÕES AUXILIARES
 ***************************************************/

function chunkText(text, maxLength = 1500) {
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      // Parágrafo maior que o limite: divide por sentenças antes de agrupar
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      const sentences = paragraph.match(/[^.!?]+[.!?]*/g) || [paragraph];
      for (const sentence of sentences) {
        if ((currentChunk.length + sentence.length) < maxLength) {
          currentChunk += sentence + " ";
        } else {
          if (currentChunk.length > 0) chunks.push(currentChunk.trim());
          currentChunk = sentence + " ";
        }
      }
    } else if ((currentChunk.length + paragraph.length) < maxLength) {
      currentChunk += paragraph + "\n\n";
    } else {
      if (currentChunk.length > 0) chunks.push(currentChunk.trim());
      currentChunk = paragraph + "\n\n";
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.trim());
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
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({ content: { parts: [{ text: text }] } }),
    muteHttpExceptions: true
  };
  try {
    const data = fetchWithRetry(url, options);
    if (data.error) {
      Logger.log(`❌ Erro na API Embedding: ${data.error.message}`);
      throw new Error(data.error.message);
    }
    return data?.embedding?.values || [];
  } catch (e) {
    Logger.log("❌ Erro ao gerar embedding (após retentativas): " + e);
    throw e;
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

  // Tenta obter o arquivo diretamente pelo ID em cache (evita getFilesByName a cada chamada)
  let file = null;
  const cachedFileId = cache.get(CACHE_KB_FILE_ID);
  if (cachedFileId) {
    try {
      file = DriveApp.getFileById(cachedFileId);
    } catch (e) {
      cache.remove(CACHE_KB_FILE_ID); // ID inválido
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
    Logger.log("🔄 Base de conhecimento alterada. Recarregando do Drive e atualizando o cache...");
    const fileContent = file.getBlob().getDataAsString('UTF-8');
    cache.put(CACHE_KB_TEXT, fileContent, CACHE_TTL);
    cache.put(CACHE_KB_TIMESTAMP, fileLastUpdated, CACHE_TTL);
    return { text: fileContent, timestamp: fileLastUpdated };
  }

  return { text: cache.get(CACHE_KB_TEXT), timestamp: cachedTimestamp };
}

function registrarPerguntaSemResposta(pergunta, historico, respostaIA) {
  try {
    const folder = getKnowledgeFolder();
    if (!folder) {
      Logger.log("❌ Não foi possível registrar a pergunta. Pasta de conhecimento não encontrada.");
      return;
    }
    const reportFiles = folder.getFilesByName(REPORT_FILE_NAME);
    
    let historicoFormatado = "Nenhum histórico anterior.\n";
    if (historico && historico.length > 0) {
      historicoFormatado = historico
        .map(item => `${item.role === 'user' ? 'USUÁRIO' : 'IA'}: ${item.parts[0].text}`)
        .join('\n') + '\n';
    }

    const newEntry = `
    --- REGISTRO: ${new Date().toLocaleString('pt-BR')} ---
    HISTÓRICO DA CONVERSA:
    ${historicoFormatado}
    PERGUNTA ATUAL: ${pergunta}
    RESPOSTA DA IA (FALHA): ${respostaIA}
    --- FIM REGISTRO ---\n
    `;
    
    let file;
    if (reportFiles.hasNext()) {
      file = reportFiles.next();
      const currentContent = file.getBlob().getDataAsString('UTF-8');
      file.setContent(currentContent + newEntry);
    } else {
      file = folder.createFile(REPORT_FILE_NAME, newEntry, 'text/plain');
    }
    Logger.log(`📝 Pergunta registrada no relatório: ${REPORT_FILE_NAME}`);
  } catch (e) {
    Logger.log(`❌ Erro ao registrar pergunta no relatório: ${e}`);
  }
}


/**
 * Registra o feedback do usuário (like/dislike) em um arquivo de log separado.
 */
function registrarFeedback(pergunta, resposta, feedback) {
  try {
    
    // Se o feedback for 'like', encerra a função e não salva nada.
    if (feedback === 'like') {
      Logger.log("ℹ️ Feedback 'like' recebido. Nenhuma ação necessária (não será salvo).");
      return; 
    }
    // ----------------------

    const folder = getKnowledgeFolder();
    if (!folder) {
      Logger.log("❌ Não foi possível registrar o feedback. Pasta de conhecimento não encontrada.");
      return;
    }
    const reportFiles = folder.getFilesByName(REPORT_FEEDBACK_FILE_NAME);
    
    const feedbackSimbolo = '👎'; 

    const newEntry = `
--- FEEDBACK: ${new Date().toLocaleString('pt-BR')} ---
FEEDBACK: ${feedbackSimbolo}
PERGUNTA: ${pergunta}
RESPOSTA: ${resposta}
--- FIM REGISTRO ---\n
`;
    
    let file;
    if (reportFiles.hasNext()) {
      file = reportFiles.next();
      const currentContent = file.getBlob().getDataAsString('UTF-8');
      file.setContent(currentContent + newEntry);
    } else {
      file = folder.createFile(REPORT_FEEDBACK_FILE_NAME, newEntry, 'text/plain');
    }
    Logger.log(`📝 Feedback (${feedbackSimbolo}) registrado no relatório: ${REPORT_FEEDBACK_FILE_NAME}`);
  } catch (e) {
    Logger.log(`❌ Erro ao registrar feedback no relatório: ${e}`);
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
function recuperarOuGerarEmbeddings(folder, fullText, fileTimestamp) {
  const cache = CacheService.getScriptCache();

  // 1. Verifica o CacheService primeiro (evita leitura do Drive na maioria das requisições)
  const cachedChunks = carregarEmbeddingsDoCache(fileTimestamp);
  if (cachedChunks) return cachedChunks;

  // 2. Tenta localizar o arquivo JSON de embeddings no Drive via ID em cache
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
      const data = JSON.parse(existingFile.getBlob().getDataAsString());
      if (data.timestamp === fileTimestamp && data.chunks && data.chunks.length > 0) {
        Logger.log(`✅ ${data.chunks.length} embeddings carregados do Drive. Salvando no cache...`);
        salvarEmbeddingsNoCache(fileTimestamp, data.chunks);
        return data.chunks;
      }
      Logger.log("🔄 Embeddings desatualizados. Regenerando...");
      existingFile.setTrashed(true);
      cache.remove(CACHE_EMB_FILE_ID);
    } catch (e) {
      Logger.log(`⚠️ Erro ao ler JSON de embeddings (corrompido?). Regenerando... ${e}`);
    }
  } else {
    Logger.log("🆕 Nenhum arquivo de embeddings encontrado. Gerando pela primeira vez...");
  }

  // 3. Gera novos embeddings (acontece apenas quando o documento de conhecimento muda)
  const chunks = chunkText(fullText);
  const baseDeDados = [];
  Logger.log(`🔨 Gerando embeddings para ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) Utilities.sleep(500); // Pausa para respeitar o rate limit da API de Embeddings.
    // Erros 429 são tratados automaticamente pelo fetchWithRetry com backoff exponencial.
    const vetor = generateEmbedding(chunks[i]);
    if (vetor && vetor.length > 0) {
      baseDeDados.push({ text: chunks[i], embedding: vetor });
    } else {
      Logger.log(`⚠️ Falha ao gerar vetor para o chunk ${i}. Ignorando.`);
    }
  }

  if (baseDeDados.length > 0) {
    const payload = { timestamp: fileTimestamp, chunks: baseDeDados };
    const newFile = folder.createFile(EMBEDDINGS_FILE_NAME, JSON.stringify(payload), "application/json");
    cache.put(CACHE_EMB_FILE_ID, newFile.getId(), CACHE_TTL);
    salvarEmbeddingsNoCache(fileTimestamp, baseDeDados);
    Logger.log("💾 Novos embeddings salvos no Drive e no CacheService.");
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
  const TOP_K = 3; // Limite de chunks recuperados. Valores acima de 3 podem causar erros na API em cenários de alta carga.
  const SIMILARITY_THRESHOLD_FOR_RETRIEVAL = 0.3; 
  
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
  
  Logger.log(`Retornando ${topChunks.length} chunks. Maior similaridade: ${maiorSimilaridade}`);
  return { contextos: contextos, maiorSimilaridade: maiorSimilaridade };
}


function responderPergunta(pergunta, historico, modo) {

  const MAX_PERGUNTA_LENGTH = 1000;

  if (!pergunta || typeof pergunta !== 'string' || pergunta.trim().length === 0) {
    return "❌ Pergunta inválida ou vazia.";
  }

  if (pergunta.length > MAX_PERGUNTA_LENGTH) {
    return `❌ Pergunta muito longa. Por favor, limite sua pergunta a ${MAX_PERGUNTA_LENGTH} caracteres.`;
  }

  pergunta = pergunta.trim();

  // Modo de operação: Informar (padrão) ou Ensinar
  if (modo === 'Ensinar') {
    Logger.log("🧠 Modo 'Ensinar' ativado por usuário.");
  } else {
    Logger.log("🧠 Modo 'Informar' (padrão) ativado.");
  }

  historico = historico || [];

  try {
    // 1. LÓGICA DE BUSCA DE CONTEXTO (RAG)
    Logger.log(`Iniciando busca de contexto para: "${pergunta}"`);
    
    // Assume que a função encontrarContextoRelevante existe no seu código
    const resultadoBusca = encontrarContextoRelevante(pergunta); 
    const contextos = resultadoBusca.contextos; 
    const similaridade = resultadoBusca.maiorSimilaridade; 
    const contexto = contextos.join("\n\n---\n\n"); 
    
    // 2. Tratamento de erro do RAG
    if (contextos.length === 1 && contextos[0].includes("Erro")) {
      Logger.log(`Erro retornado pelo RAG: ${contextos[0]}`);
      return contextos[0]; 
    }

    const SIMILARITY_THRESHOLD = 0.3;

    // --- PROMPT da i.a 
    const promptInformar = {
      parts: [{ text: `
        Você é um assistente virtual amigável e prestativo, especialista nos procedimentos do DRA. Sua tarefa é analisar a PERGUNTA do usuário, o HISTÓRICO da conversa e os dados de CONTEXTO e SIMILARIDADE para formular a melhor resposta. O HISTÓRICO é crucial. Se a pergunta for curta (ex: "e sobre X?", "por que?"), ela provavelmente se refere à sua resposta anterior. O CONTEXTO pode conter vários trechos do documento, separados por "---". Encontre a resposta relevante dentro deles.

        REGRAS DE FORMATAÇÃO: Sempre formate suas respostas usando Markdown simples para facilitar a leitura. Use negrito para destacar termos importantes e listas com hífens (-) ou números (1., 2.) para passos ou itens. Não use cabeçalhos (#).

        NOVA REGRA: TOM DE VOZ E ENCERRAMENTO:
        Seja sempre amigável, prestativo e direto ao ponto.
        Após dar a resposta (Regra 1) ou se não encontrar (Regra 2), sempre termine com uma pergunta amigável, como "Posso ajudar em algo mais?" ou "Isso esclarece sua dúvida?".

        REGRAS DE COMPORTAMENTO:

        PERGUNTA SOBRE O DRA (COM BOM CONTEXTO):
        Se a PERGUNTA for sobre os procedimentos do DRA e a SIMILARIDADE for ALTA (acima de ${SIMILARITY_THRESHOLD}), use o CONTEXTO fornecido para responder.
        Refine a Apresentação: Mesmo que o contexto seja um bloco de texto, use as regras de formatação (listas, negrito) para organizar a informação e torná-la fácil de ler.
        Seja Fiel ao Contexto: Seja direto e claro. Não adicione informações que não estejam no contexto nem tente "ensinar" o porquê (esse é o trabalho do modo "Ensinar").

        PERGUNTA SOBRE O DRA (COM CONTEXTO RUIM):
        Se a PERGUNTA parece ser sobre o DRA, mas a SIMILARIDADE for BAIXA (abaixo de ${SIMILARITY_THRESHOLD}) ou o CONTEXTO não contiver a resposta, responda educadamente: "Hum, não consegui encontrar essa informação exata nos meus documentos."
        Dê a Próxima Etapa: Em seguida, ajude o usuário sugerindo o modo "Ensinar". Diga: "Dica: Se você for um colaborador e achar que esta é uma informação que eu deveria saber, por favor, mude o seletor para o modo 'Ensinar' e envie a pergunta. Isso notificará um especialista para me treinar!"

        PERGUNTAS "META" (SOBRE VOCÊ):
        Se a PERGUNTA for sobre você, suas capacidades, ou saudações, responda de forma amigável e natural.
        Explique que você é um assistente focado em ajudar com as dúvidas sobre os procedimentos do DRA.
        (Ex: "Olá! Eu sou um assistente virtual e estou aqui para ajudar com perguntas sobre o DRA.")

        PERGUNTAS FORA DE TÓPICO (NÃO RELACIONADAS):
        Se a PERGUNTA NÃO tiver relação com o DRA, recuse educadamente.
        Diga algo como: "Desculpe, mas só posso responder perguntas relacionadas aos procedimentos do DRA."
      `}]
    };

    // --- PROMPT ENSINAR 
    const promptEnsinar = {
      parts: [{ text: `
        Você é um Mentor Sênior especialista nos procedimentos do DRA. Sua principal função é ENSINAR o colaborador. Sua tarefa é analisar a PERGUNTA, o HISTÓRICO e os dados de CONTEXTO para formular uma resposta didática, como um professor. O HISTÓRICO é crucial. Se a pergunta for curta (ex: "e sobre X?"), ela provavelmente se refere à sua resposta anterior. O CONTEXTO pode conter vários trechos do documento, separados por "---".

        REGRAS DE FORMATAÇÃO (Didática): Sempre formate suas respostas usando Markdown simples. Use negrito para destacar conceitos-chave. Use listas com números (1., 2.) para explicar passos (o "como chegar lá"). Use listas com hífens (-) para destacar pontos de atenção (o "o que cuidar", armadilhas, exceções).

        REGRAS DE COMPORTAMENTO (ENSINAR):

        CASO ESPECIAL (MODELOS DE RESPOSTA):
        Se o CONTEXTO contiver claramente um modelo de resposta ou comunicado padrão (ex: "Prezado(a) Aluno(a), Documento anexado..."), sua tarefa principal é dupla:
        1. Forneça o Modelo: Apresente o modelo de resposta exato para o colaborador, usando aspas ou um bloco de citação, para que ele aprenda o texto correto.
        2. Ensine o "Porquê": Explique o motivo por trás dessa resposta. (Ex: "Quando o aluno solicitar X, este é o comunicado padrão que utilizamos.")
        3. Refine a Explicação: O CONTEXTO foi escrito por um colaborador. Se a explicação dele sobre "quando usar" parecer confusa, não copie literalmente. Sua função de Mentor é refinar e simplificar a explicação, tornando-a mais clara.
        4. Destaque "O que Cuidar": Use hífens (-) para explicar os pré-requisitos ou verificações necessárias antes de usar essa resposta. (Ex: "- Lembre-se de usar essa resposta apenas após a aprovação do preview, como o texto menciona.")

        PERGUNTA SOBRE O DRA (COM BOM CONTEXTO GERAL):
        (Se não for um modelo de resposta padrão)
        Refine a Explicação: O CONTEXTO foi escrito por um colaborador. Se a linguagem dele parecer confusa, difícil ou muito técnica, não copie literalmente. Sua função de Mentor é refinar, simplificar e organizar essa informação para que o aprendizado seja fácil.
        Explique o "Porquê": Tente explicar o motivo por trás do procedimento (se estiver implícito no contexto).
        Destaque Passos: Se a pergunta for sobre um processo ("como fazer X"), detalhe os passos claramente (o "como chegar lá").
        Destaque "O que Cuidar": Aponte armadilhas comuns, exceções ou detalhes importantes mencionados no CONTEXTO (o "o que cuidar").
        Seja encorajador e claro.

        PERGUNTA SOBRE O DRA (COM CONTEXTO RUIM):
        Se a SIMILARIDADE for BAIXA (abaixo de ${SIMILARITY_THRESHOLD}) ou o CONTEXTO não contiver a resposta, responda educadamente: "Não encontrei essa informação no documento para poder ensiná-lo em detalhes."

        PERGUNTAS "META" (SOBRE VOCÊ):
        Responda de forma amigável. Explique que você é um assistente focado em ensinar os procedimentos do DRA.
        (Ex: "Olá! Eu sou um assistente de ensino e estou aqui para ajudar você a entender a fundo os processos do DRA.")

        PERGUNTAS FORA DE TÓPICO (NÃO RELACIONADAS):
        Recuse educadamente.
        Diga algo como: "Meu foco é ensinar sobre os procedimentos do DRA. Não consigo ajudar com esse tópico."
      `}]
    };

    // 3. Lógica para escolher o prompt certo
    let systemInstruction;
    if (modo === 'Ensinar') {
      systemInstruction = promptEnsinar;
    } else {
      systemInstruction = promptInformar;
    }

    const promptParaUsuario = `
      ---
      DADOS PARA ANÁLISE (RAG):
      SIMILARIDADE (Do chunk Top-1): ${similaridade.toFixed(4)}
      (Limite de confiança: ${SIMILARITY_THRESHOLD})
      CONTEXTO (Top-${contextos.length} chunks encontrados):
      ${contexto || "Nenhum contexto encontrado."}
      ---
      PERGUNTA:
      ${pergunta}
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/${GENERATIVE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const contentsPayload = [
      ...historico, 
      { 
        role: "user", 
        parts: [{ text: promptParaUsuario }] 
      }
    ];

    const payload = {
      contents: contentsPayload,
      systemInstruction: systemInstruction 
    };
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true 
    };
    
    // Assume que fetchWithRetry existe no seu código
    const data = fetchWithRetry(url, options);

    if (typeof data !== 'object' || data === null) {
      Logger.log(`❌ Erro inesperado de fetchWithRetry. Retornou: ${data}`);
      return `Erro no servidor: ${data}`;
    }

    if (data.error) {
        Logger.log(`❌ Erro da API Gemini (JSON): ${data.error.message}`);
        return `Erro ao chamar a API (JSON): ${data.error.message}`;
    }
    
    const resposta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    // --- SEGURANÇA (SAFETY FILTER) ---
    if (!resposta) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      Logger.log(`⚠️ A resposta está vazia. FinishReason: ${finishReason}`);
      
      if (finishReason === "SAFETY") {
        return "❌ A sua solicitação foi bloqueada por motivos de segurança. Por favor, reformule sua pergunta.";
      }
      if (finishReason) {
          return `❌ A resposta foi bloqueada pela API. Motivo: ${finishReason}`;
      }
    }

    // --- REGISTRO DE RESPOSTAS FALHAS ---
    if (resposta) {
      const respostaLower = resposta.toLowerCase();
      
      const isFailure = respostaLower.includes("não encontrei") || 
                        respostaLower.includes("não está detalhado") ||
                        respostaLower.includes("não consta no") ||
                        respostaLower.includes("não localizei");

      const isRefusal = respostaLower.includes("só posso responder") ||
                        respostaLower.includes("fui treinado apenas");

      if (isFailure && !isRefusal) {
        Logger.log("Registrando pergunta (IA não encontrou no RAG - Genérico)...");
        // Assume que esta função existe no código
        registrarPerguntaSemResposta(pergunta, historico, resposta);
      }
    }

    return resposta || "Não foi possível gerar uma resposta.";

  } catch (e) {
    // --- TRATAMENTO DE ERROS ---
    Logger.log('❌ Erro capturado em responderPergunta: ' + e);
    const msgErro = (e.message || e.toString()).toLowerCase();

    if (msgErro.includes("429") || msgErro.includes("quota") || msgErro.includes("resource_exhausted")) {
      return "😅 Ufa, trabalhei bastante agora! Atingi meu limite de velocidade. Por favor, aguarde uns 2 minutinhos e tente perguntar novamente.";
    }

    if (msgErro.includes("503") || msgErro.includes("overloaded") || msgErro.includes("temporarily overloaded")) {
      return "🚦 Meus servidores estão congestionados no momento. Tente enviar sua pergunta de novo em 1 minuto, por favor.";
    }

    if (msgErro.includes("safety") || msgErro.includes("blocked") || msgErro.includes("harmful")) {
      return "🛡️ Por motivos de segurança e diretrizes de conteúdo, não posso gerar uma resposta para essa solicitação específica.";
    }

    if (msgErro.includes("key") || msgErro.includes("403") || msgErro.includes("api key") || msgErro.includes("invalid argument")) {
      return "🔑 Parece haver um problema técnico com minha chave de acesso. Por favor, avise ao colaborador responsável.";
    }

    return "😔 Ocorreu um problema técnico inesperado. Por favor, informe ao colaborador responsável.";
  }
}
/***************************************************
 * FUNÇÃO DE DIAGNÓSTICO: LISTAR MODELOS
 ***************************************************/
 // função usada para enontrar possiveis modelos 
function listarModelosDisponiveis() {
  if (!GEMINI_API_KEY) {
    Logger.log('❌ Chave de API não encontrada nas Propriedades do Script.');
    return;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  const options = {
    method: 'GET',
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const rawResponse = response.getContentText();
    const data = JSON.parse(rawResponse);
    if (data.error) {
      Logger.log(`❌ Erro ao listar modelos: ${data.error.message}`);
      return;
    }
    Logger.log('✅ Modelos disponíveis para sua chave:');
    const formattedModels = data.models.map(model => ({
      nome: model.name,
      metodosSuportados: model.supportedGenerationMethods
    }));
    Logger.log(JSON.stringify(formattedModels, null, 2));
  } catch (e) {
    Logger.log(`🚨 Erro crítico na execução: ${e.message}`);
  }
}
// Função unificada para testar o "Cérebro" do Chat
function executarTestesDeSistema() {
  Logger.log("========= 🚀 INICIANDO SUÍTE DE TESTES =========");
  
  const perguntaTeste = "Qual o procedimento para abrir um chamado?"; // Mude para algo do seu PDF/TXT
  Logger.log(`📌 Pergunta de Teste: "${perguntaTeste}"`);

  // --- TESTE 1: O RAG (Busca de Contexto) ---
  // É vital saber se os Embeddings estão achando o texto certo antes de culpar a IA.
  Logger.log("\n--- TESTE 1: Recuperação de Contexto (Embeddings) ---");
  try {
    const resultadoBusca = encontrarContextoRelevante(perguntaTeste);
    Logger.log(`✅ Chunks retornados: ${resultadoBusca.contextos.length}`);
    Logger.log(`✅ Maior Similaridade: ${resultadoBusca.maiorSimilaridade.toFixed(4)}`);
    if (resultadoBusca.contextos.length > 0) {
      Logger.log(`Trecho mais relevante encontrado:\n"${resultadoBusca.contextos[0].substring(0, 150)}..."`);
    } else {
      Logger.log("⚠️ AVISO: Nenhum contexto foi achado. O documento não tem essa informação ou o limite de similaridade está muito alto.");
    }
  } catch (e) {
    Logger.log(`❌ Falha no Teste 1: ${e}`);
  }

  // --- TESTE 2: Geração de Resposta (Modo Informar) ---
  Logger.log("\n--- TESTE 2: Geração de Resposta (Modo Informar) ---");
  try {
    const respostaInformar = responderPergunta(perguntaTeste, [], 'Informar');
    Logger.log(`✅ Resposta do Assistente:\n${respostaInformar}`);
  } catch (e) {
    Logger.log(`❌ Falha no Teste 2: ${e}`);
  }

  // --- TESTE 3: Geração de Resposta (Modo Ensinar) ---
  Logger.log("\n--- TESTE 3: Geração de Resposta (Modo Ensinar) ---");
  try {
    const respostaEnsinar = responderPergunta(perguntaTeste, [], 'Ensinar');
    Logger.log(`✅ Resposta do Mentor:\n${respostaEnsinar}`);
  } catch (e) {
    Logger.log(`❌ Falha no Teste 3: ${e}`);
  }

  Logger.log("\n========= 🏁 TESTES CONCLUÍDOS =========");
}
/***************************************************
 * FUNÇÃO DE ENTRADA DO APLICATIVO WEB 
 ***************************************************/
function doGet(e) {
  Logger.log("=========================================");
  Logger.log("🚀 doGet: Iniciando carregamento do Aplicativo Web.");
  
  const template = HtmlService.createTemplateFromFile('index');

  // Autenticação gerenciada pelo Google Script (baseada no e-mail do usuário)
  template.isAdmin = true;

  // --- CARREGAMENTO DE IMAGENS ---
  Logger.log(`Buscando ${LOGO_FILE_NAME}...`);
  template.logoData = getImageData(LOGO_FILE_NAME); 
  
  Logger.log(`Buscando ${BACKGROUND_FILE_NAME}...`);
  template.bgData = getImageData(BACKGROUND_FILE_NAME); 
  
  Logger.log(`Buscando ${AVATAR_AI_FILE_NAME}...`);
  template.avatarAiData = getImageData(AVATAR_AI_FILE_NAME); 

  Logger.log("✅ doGet: Dados injetados. Gerando HTML...");
  
  const htmlOutput = template.evaluate()
      .setTitle('Assistente DRA - UNISUAM')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  Logger.log("=========================================");
  return htmlOutput;
}