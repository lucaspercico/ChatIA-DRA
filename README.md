# 🤖 ChatIA-DRA — Assistente Virtual do DRA (UNISUAM)

Assistente de IA conversacional construído sobre **Google Apps Script** e **Gemini AI**, com busca semântica por similaridade (RAG) sobre uma base de conhecimento personalizada. Desenvolvido para o Departamento de Registro Acadêmico (DRA) da UNISUAM.

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| 💬 Chat em tempo real | Interface de bate-papo responsiva, com suporte a Markdown nas respostas |
| 🔍 RAG (Retrieval-Augmented Generation) | Busca semântica por embeddings para encontrar o contexto mais relevante antes de responder |
| 🧠 Cache de Embeddings | Os vetores gerados são armazenados no Google Drive; só são regenerados quando o documento de conhecimento muda, economizando custos de API |
| 🎓 Dois modos de resposta | **Informar** (respostas diretas para alunos) e **Ensinar** (explicações didáticas para colaboradores) |
| 👍👎 Feedback | Botões de like/dislike em cada resposta; feedbacks negativos são registrados automaticamente para revisão |
| 📝 Relatório de lacunas | Perguntas não respondidas são salvas em arquivo `.txt` no Drive para alimentar a base de conhecimento futuramente |
| 🖼️ Personalização visual | Logo, imagem de fundo e avatar da IA são carregados dinamicamente do Google Drive |
| 🔑 Autenticação via Google | O controle de acesso é gerenciado pelo próprio Google Script com base no e-mail do usuário — sem necessidade de implementar autenticação manual |
| ♻️ Histórico de conversa | Mantém as últimas 10 trocas da sessão para respostas contextuais |

---

## 🏗️ Arquitetura

```
Usuário (Browser)
      │
      ▼
┌─────────────────────────────────────────────┐
│          Google Apps Script                  │
│                                             │
│  doGet()  →  index.html (HtmlService)       │
│                                             │
│  responderPergunta()                        │
│    ├─ encontrarContextoRelevante()          │
│    │    ├─ generateEmbedding()  → Gemini API│
│    │    └─ recuperarOuGerarEmbeddings()     │
│    │         └─ Google Drive (JSON cache)   │
│    └─ fetchWithRetry()  → Gemini API        │
│                                             │
│  registrarFeedback()  → Google Drive        │
│  registrarPerguntaSemResposta()  → Drive    │
└─────────────────────────────────────────────┘
```

**Tecnologias utilizadas:**
- **Google Apps Script** — hospedagem, back-end e integração com o ecossistema Google
- **Google Drive** — armazenamento do arquivo de conhecimento (`conhecimento.txt`), embeddings em cache (`embeddings_db.json`), imagens e relatórios
- **Gemini AI** — modelo generativo (`gemini-flash-latest`) e modelo de embeddings (`text-embedding-004`)
- **marked.js** — renderização de Markdown no front-end

---

## 🚀 Como Usar (Passo a Passo)

### Pré-requisitos

- Conta Google (Google Workspace ou pessoal)
- Chave de API do Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

### 1. Preparar o Google Drive

Crie uma pasta no seu Google Drive chamada exatamente:

```
I.A conhecimento
```

Dentro dela, adicione os seguintes arquivos:

| Arquivo | Obrigatório | Descrição |
|---|---|---|
| `conhecimento.txt` | ✅ Sim | Base de conhecimento em texto puro. Escreva os procedimentos, respostas e informações que a IA deve saber. |
| `logo.png` | ❌ Opcional | Logotipo exibido no cabeçalho do chat |
| `background.png` | ❌ Opcional | Imagem de fundo da interface |
| `i.a.png` | ❌ Opcional | Avatar exibido nas mensagens da IA |

> **Dica para o `conhecimento.txt`:** Organize o conteúdo em parágrafos separados por linhas em branco. Cada parágrafo vira um "chunk" de conhecimento pesquisável. Quanto mais claro e bem estruturado, melhores serão as respostas.

---

### 2. Criar o Projeto no Google Apps Script

1. Acesse [https://script.google.com](https://script.google.com) e clique em **Novo projeto**.
2. Renomeie o projeto (ex: `ChatIA-DRA`).
3. Substitua o conteúdo do arquivo `Code.gs` pelo conteúdo do arquivo `Code.gs` deste repositório.
4. Crie um novo arquivo HTML: clique em **+** → **HTML** → nomeie como `index`.
5. Substitua o conteúdo do `index.html` pelo arquivo `index.html` deste repositório.

---

### 3. Configurar a Chave de API

1. No editor do Apps Script, clique em **Configurações do projeto** (ícone de engrenagem ⚙️).
2. Role até **Propriedades do script** e clique em **Adicionar propriedade**.
3. Adicione:
   - **Chave:** `GEMINI_API_KEY`
   - **Valor:** sua chave de API do Google AI Studio

> ⚠️ **Nunca coloque a chave diretamente no código.** Use sempre as Propriedades do Script para manter a chave segura.

---

### 4. Implantar como Aplicativo Web

1. Clique em **Implantar** → **Nova implantação**.
2. Em **Tipo**, selecione **Aplicativo da Web**.
3. Configure:
   - **Executar como:** `Eu` (ou a conta com acesso ao Drive)
   - **Quem tem acesso:** escolha de acordo com sua necessidade:
     - `Qualquer pessoa` — acesso público (sem login)
     - `Qualquer pessoa dentro de [sua organização]` — somente usuários da organização (recomendado para uso corporativo)
     - `Somente eu` — apenas o proprietário
4. Clique em **Implantar** e copie a **URL do aplicativo da Web**.

> **Sobre autenticação:** O Google Apps Script gerencia o controle de acesso automaticamente com base no e-mail do usuário, conforme a opção de acesso selecionada acima. Não é necessário implementar login ou senha no código.

---

### 5. Primeira Execução (Geração de Embeddings)

Na primeira vez que a IA receber uma pergunta, ela irá:

1. Ler o arquivo `conhecimento.txt` do Drive.
2. Dividir o texto em pedaços (*chunks*) de até 1.500 caracteres.
3. Gerar um vetor de embedding para cada chunk via Gemini API.
4. Salvar tudo em `embeddings_db.json` no Drive para uso futuro.

> ⏳ Esse processo pode levar **1-2 minutos** na primeira vez, dependendo do tamanho do documento. Nas consultas seguintes, os embeddings são carregados diretamente do cache (instantâneo).

---

### 6. Atualizar a Base de Conhecimento

Edite e salve o arquivo `conhecimento.txt` no Drive. O sistema detecta automaticamente que o arquivo mudou (comparando o timestamp) e regenera os embeddings na próxima consulta.

---

## ⚙️ Configurações

As principais configurações ficam no início do arquivo `Code.gs`:

```javascript
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY'); // Chave via Propriedades do Script
const EMBEDDING_MODEL = 'models/text-embedding-004';        // Modelo de embeddings
const GENERATIVE_MODEL = 'models/gemini-flash-latest';      // Modelo generativo

const DRIVE_FOLDER_NAME = "I.A conhecimento";  // Nome da pasta no Drive
const KNOWLEDGE_FILE_NAME = "conhecimento.txt"; // Arquivo de conhecimento
```

### Parâmetros de Busca (`encontrarContextoRelevante`)

```javascript
const TOP_K = 3;                              // Número máximo de chunks retornados
const SIMILARITY_THRESHOLD_FOR_RETRIEVAL = 0.3; // Limiar mínimo de similaridade
```

---

## 📂 Estrutura do Repositório

```
ChatIA-DRA/
├── Code.gs       # Back-end: lógica de RAG, embeddings, prompts e integração com APIs
├── index.html    # Front-end: interface do chat (CSS, HTML e JavaScript)
└── README.md     # Esta documentação
```

---

## 🔧 Funções de Diagnóstico

O `Code.gs` inclui funções utilitárias que podem ser executadas diretamente no editor do Apps Script:

| Função | Descrição |
|---|---|
| `testarResponderPergunta()` | Simula uma pergunta completa e exibe a resposta nos logs. Edite `perguntaTeste` para testar cenários específicos. |
| `listarModelosDisponiveis()` | Lista todos os modelos Gemini acessíveis com a sua chave de API. Útil para verificar se a chave está correta. |
| `testarChat()` | Executa um teste básico de conversa e exibe o resultado nos logs. |

Para executar: no editor, selecione a função no menu suspenso e clique em **▶ Executar**.

---

## 🛡️ Segurança

- A chave de API é armazenada nas **Propriedades do Script** (nunca no código-fonte).
- O controle de acesso ao aplicativo é gerenciado pelo Google (OAuth / e-mail da conta Google).
- Entradas do usuário são validadas no front-end e no back-end (tamanho máximo de 1.000 caracteres).
- A API Gemini aplica filtros de segurança nativos; respostas bloqueadas são tratadas com mensagens amigáveis.
- Feedbacks negativos e perguntas sem resposta são registrados em arquivos `.txt` privados no Drive do proprietário.

---

## 📈 Benefícios

- **Custo zero de infraestrutura:** roda 100% no Google Apps Script, sem necessidade de servidor externo.
- **Cache inteligente:** embeddings são gerados apenas uma vez por versão do documento, reduzindo drasticamente o consumo da API.
- **Fácil de manter:** atualizar o conhecimento da IA é tão simples quanto editar um arquivo de texto no Google Drive.
- **Sem lock-in de autenticação:** usa o sistema de identidade do Google, que você já usa no dia a dia.
- **Rastreabilidade:** relatórios automáticos de lacunas de conhecimento e feedbacks negativos ajudam a melhorar continuamente a base de conhecimento.

---

## 📄 Licença

Este projeto está licenciado sob a [MIT License](LICENSE).
