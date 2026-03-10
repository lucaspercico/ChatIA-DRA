/***************************************************
 * Chat DRA com Gemini 2.5 Flash + Embeddings Cache
 * Autor: Lucas + I.A fiz em low-code 
 * * MODIFICADO: Versão final com RAG Top-K, Histórico,
 * Retentativas de API e carregamento de imagens do Drive.
 * Otimizações: Markdown, Feedback e Nome do Modelo.
 * 
    Ler e Limpar	getKnowledgeData
    Traduzir para Números	getEmbeddings
    Decidir o que é relevante	findMostRelevantChunks
    Montar e Enviar o Pedido	callGemini
 ***************************************************/

/** CONFIGURAÇÕES */

const props = PropertiesService.getScriptProperties();
const SENHA_MESTRA = props.getProperty('SENHA_MESTRA');

// Se não estiver configurada, lance erro
if (!SENHA_MESTRA) {
  throw new Error("ERRO: SENHA_MESTRA não configurada nas propriedades do script. Configure antes de usar.");
}

const props = PropertiesService.getScriptProperties();
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');

const EMBEDDING_MODEL = 'models/text-embedding-004';


const GENERATIVE_MODEL = 'models/gemini-flash-latest'; 

// --- CONFIGURAÇÕES DE ARQUIVOS DO DRIVE ---
const DRIVE_FOLDER_NAME = "I.A conhecimento";
const KNOWLEDGE_FILE_NAME = "conhecimento.txt";
const REPORT_FILE_NAME = "Relatorio_Pergunstas_Nao_Respondidas.txt";
const LOGO_FILE_NAME = "logo.png"; 


const BACKGROUND_FILE_NAME = "background.png"; // Seu arquivo se chama "fundo.png"
const AVATAR_AI_FILE_NAME = "i.a.png"; 


const REPORT_FEEDBACK_FILE_NAME = "Relatorio_Feedback_IA.txt";
// cria um conhecimento não apagavel economiza recursos
const EMBEDDINGS_FILE_NAME = "embeddings_db.json";


/***************************************************
 *  FUNÇÕES AUXILIARES
 ***************************************************/

function chunkText(text, maxLength = 1500) {
  const chunks = [];
  // Divide primeiro por parágrafos (duas quebras de linha)
  let paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    // Se o parágrafo + o chunk atual couberem, junta
    if ((currentChunk.length + paragraph.length) < maxLength) {
      currentChunk += paragraph + "\n\n";
    } else {
      // Se não couber, salva o atual e começa um novo
      if (currentChunk.length > 0) chunks.push(currentChunk.trim());
      currentChunk = paragraph + "\n\n";
    }
  }
  // Adiciona o que sobrou
  if (currentChunk.length > 0) chunks.push(currentChunk.trim());
  
  return chunks;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  if (!a || !b || a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
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
  const payload = {
    content: {
      parts: [{ text: text }]
    }
  };
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true 
  };
  
  try {
    // fetchWithRetry AGORA RETORNA O JSON (objeto 'data') DIRETAMENTE.
    // não precisamo mais chamar .getContentText() ou JSON.parse().
    const data = fetchWithRetry(url, options);

    // Se o JSON retornado tiver um erro, logamos.
    if (data.error) {
      Logger.log(`❌ Erro na API Embedding (JSON): ${data.error.message}`);
      throw new Error(data.error.message); // <--- Lança o erro para o tratador principal
    }
    
    // Retornamos os valores do embedding diretamente.
    return data?.embedding?.values || [];

  } catch (e) {
    // Se fetchWithRetry falhar (ex: 400, 500), o erro será pego aqui.
    Logger.log("❌ Erro ao gerar embedding (após retentativas): " + e);
    throw e;
  }
}

/***************************************************
 *  LÓGICA DO GOOGLE DRIVE
 ***************************************************/

function getKnowledgeFolder() {
  try {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    } else {
      Logger.log(`❌ Pasta não encontrada: ${DRIVE_FOLDER_NAME}`);
      return null;
    }
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
  if (!folder) {
    return { text: null, timestamp: null };
  }
  const files = folder.getFilesByName(KNOWLEDGE_FILE_NAME);
  if (!files.hasNext()) {
    Logger.log(`❌ Arquivo não encontrado: ${KNOWLEDGE_FILE_NAME} na pasta ${DRIVE_FOLDER_NAME}`);
    return { text: null, timestamp: null };
  }
  const file = files.next();
  const fileLastUpdated = file.getLastUpdated().toISOString();
  const cachedLastUpdated = cache.get('knowledge_base_last_updated');
  
  if (fileLastUpdated !== cachedLastUpdated) {
    Logger.log("🔄 Base de conhecimento alterada. Recarregando do Drive e atualizando o cache...");
    const fileContent = file.getBlob().getDataAsString('UTF-8');
    cache.put('knowledge_base_text', fileContent, 21600);
    cache.put('knowledge_base_last_updated', fileLastUpdated, 21600);
    return { text: fileContent, timestamp: fileLastUpdated };
  } else {
    const cachedText = cache.get('knowledge_base_text');
    return { text: cachedText, timestamp: cachedLastUpdated };
  }
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
 * Gerencia a leitura e escrita dos embeddings em um arquivo JSON no Drive.
 * Se o arquivo 'conhecimento.txt' mudou, ele regenera tudo e salva.
 * Se não mudou, ele lê direto do JSON (Zero custo de API).
 */
function recuperarOuGerarEmbeddings(folder, fullText, fileTimestamp) {
  // 1. Tenta encontrar o arquivo JSON de embeddings
  const files = folder.getFilesByName(EMBEDDINGS_FILE_NAME);
  let dbEmbeddings = null;
  let precisaRegerar = false;

  if (files.hasNext()) {
    const file = files.next();
    try {
      const jsonContent = file.getBlob().getDataAsString();
      const data = JSON.parse(jsonContent);
      
      // Verifica se a versão salva é compatível com o arquivo de texto atual
      if (data.timestamp === fileTimestamp && data.chunks && data.chunks.length > 0) {
        Logger.log("Usando embeddings cacheados do Drive (Rápido!)");
        return data.chunks; // RETORNO RÁPIDO
      } else {
        Logger.log("🔄 O arquivo de texto mudou. É necessário regenerar os embeddings...");
        precisaRegerar = true;
        // Opcional: Deletar o antigo para não acumular lixo
        file.setTrashed(true);
      }
    } catch (e) {
      Logger.log("⚠️ Erro ao ler JSON de embeddings (corrompido?). Regenerando...");
      precisaRegerar = true;
    }
  } else {
    Logger.log("🆕 Nenhum arquivo de embeddings encontrado. Gerando pela primeira vez...");
    precisaRegerar = true;
  }

  // 2. Se chegou aqui, precisa gerar novos embeddings (Lento, mas só acontece 1 vez)
  if (precisaRegerar) {
    const chunks = chunkText(fullText); 
    const baseDeDados = [];

    Logger.log(`🔨 Iniciando geração de embeddings para ${chunks.length} pedaços de texto...`);

    for (let i = 0; i < chunks.length; i++) {
      // Pequena pausa para evitar rate limit durante a geração em massa
      Utilities.sleep(1500); 
      
      const vetor = generateEmbedding(chunks[i]);
      
      // Só salva se o vetor for válido
      if (vetor && vetor.length > 0) {
        baseDeDados.push({
          text: chunks[i],
          embedding: vetor
        });
      } else {
         Logger.log(`⚠️ Falha ao gerar vetor para o chunk ${i}. Ignorando.`);
      }
    }

    // 3. Salva o resultado no Drive para o futuro
    if (baseDeDados.length > 0) {
      const payload = {
        timestamp: fileTimestamp, // A "assinatura" da versão
        chunks: baseDeDados
      };
      folder.createFile(EMBEDDINGS_FILE_NAME, JSON.stringify(payload), "application/json");
      Logger.log("💾 Novos embeddings salvos no Drive com sucesso!");
    }
    
    return baseDeDados;
  }
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
  const TOP_K = 3; // provalvlemente se colocar em supeior de 3 a api vai quebrar em teste inferiores o limite era alcançado  resultando em erro da resposta da api 
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


function responderPergunta(pergunta, historico, modo, senhaRecebida) {
  
  // VERIFICAÇÃO DE SEGURANÇA NO SERVIDOR
  if (modo === 'Ensinar') {
    // Obter o email do usuário autenticado
    const userEmail = Session.getActiveUser().getEmail();
    
    // Verificar se está na lista de emails autorizados
    const props = PropertiesService.getScriptProperties();
    const emailsAutorizados = (props.getProperty('EMAILS_ADMIN') || '').split(',').map(e => e.trim());
    
    if (!emailsAutorizados.includes(userEmail)) {
      Logger.log("⛔ Bloqueio de Segurança: Tentativa de usar modo Ensinar sem autorização.");
      return "⛔ ACESSO NEGADO: Você não tem permissão para usar o modo Ensinar.";
    }
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
      Logger.log("🧠 Modo 'Ensinar' ativado.");
    } else {
      systemInstruction = promptInformar;
      Logger.log("🧠 Modo 'Informar' (padrão) ativado.");
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
      return "🔑 Parece haver um problema técnico com minha chave de acesso. Por favor, avise para o colaborador .";
    }

    return "😔 Tive um problema técnico 'Erro Genérico' favor Informar o colaborador";
  }
}


/***************************************************
 * FUNÇÃO DE TESTE (Não use "Executar" nela)
 ***************************************************/
 //para ver se tudo está funcional
function testarChat() {
  Logger.log("--- INICIANDO TESTE DE CHAT COM HISTÓRICO ---");
  let historico = [];
  let pergunta1 = "Olá, tudo bem? O que você faz?";
  Logger.log(`P1 (Usuário): ${pergunta1}`);
  let resposta1 = responderPergunta(pergunta1, historico);
  Logger.log(`R1 (IA): ${resposta1}`);
}

/***************************************************
 * FUNÇÃO DE DIAGNÓSTICO: LISTAR MODELOS
 ***************************************************/
 // função usada para enontrar possiveis modelos 
function listarModelosDisponiveis() {
  if (!GEMINI_API_KEY) {
  throw new Error("ERRO CRÍTICO: GEMINI_API_KEY não configurada. Configure nas propriedades do script.");
};
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
    Logger.log("✅ API Key carregada com sucesso (primeiros 4 caracteres: " + GEMINI_API_KEY.substring(0, 4) + "...)");
    const formattedModels = data.models.map(model => ({
      nome: model.name,
      metodosSuportados: model.supportedGenerationMethods
    }));
    Logger.log(JSON.stringify(formattedModels, null, 2));
  } catch (e) {
    Logger.log(`🚨 Erro crítico na execução: ${e.message}`);
  }
}
/***************************************************
 * FUNÇÃO DE ENTRADA DO APLICATIVO WEB 
 ***************************************************/
 //basicamente tudo que sera enviado para o client-side
function doGet(e) {
  Logger.log("=========================================");
  Logger.log("🚀 doGet: Iniciando carregamento do Aplicativo Web.");
  
  const template = HtmlService.createTemplateFromFile('index');

  // --- AUTENTICAÇÃO SEGURA ---
  // Obter o ID do usuário atual (Google Apps Script)
  const userEmail = Session.getActiveUser().getEmail();
  
  // Lista de emails autorizados para modo Ensinar (armazenar em propriedades)
  const props = PropertiesService.getScriptProperties();
  const emailsAutorizados = (props.getProperty('EMAILS_ADMIN') || '').split(',').map(e => e.trim());
  
  // Verificar se o usuário está autorizado
  const isAdmin = emailsAutorizados.includes(userEmail);
  
  // NÃO passar a senha para o HTML! Apenas um flag
  template.isAdmin = isAdmin; 
  template.senhaAutenticada = ""; // Nunca passe a senha!

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


/***************************************************
 * FUNÇÃO DE TESTE
 * Para executar:
 * 1. Salve o arquivo.
 * 2. No editor do Apps Script, recarregue a página se necessário.
 * 3. No menu de seleção de funções (ao lado de "Depurar"), 
 * escolha "testarResponderPergunta".
 * 4. Clique em "Executar".
 * 5. Veja o resultado do log aqui embaixo na "Pilha de execução".
 ***************************************************/
function testarResponderPergunta() {
  Logger.log("========= INICIANDO TESTE MANUAL =========");
  
  // --- SIMULAÇÃO ---
  
  // 1. Mude esta pergunta para algo que você sabe que 
  //    está no seu documento "conhecimento.txt"
  const perguntaTeste = "Qual o procedimento para abrir um chamado?";
  
  // 2. Simule um histórico (pode começar vazio)
  const historicoTeste = []; 
  
  // 3. Simule o modo ('Informar' ou 'Ensinar')
  const modoTeste = 'Informar';
  
  Logger.log(`Testando com: "${perguntaTeste}", Modo: ${modoTeste}`);
  
  // --- EXECUÇÃO ---
  try {
    // Chamamos a função com os dados de teste
    const resposta = responderPergunta(perguntaTeste, historicoTeste, modoTeste);
    
    Logger.log("========= TESTE CONCLUÍDO =========");
    Logger.log("PERGUNTA: " + perguntaTeste);
    Logger.log("RESPOSTA GERADA: ");
    Logger.log(resposta); // Loga a resposta completa
    
  } catch (e) {
    Logger.log("========= TESTE FALHOU COM ERRO CRÍTICO =========");
    Logger.log(e);
  }
}