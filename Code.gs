/***************************************************
 * Chat DRA com Gemini 2.5 Flash + Embeddings Cache
 * Autor: Lucas + I.A fiz em low-code :3
 ***************************************************/

/** 🔑 CONFIGURAÇÕES */
// LEIA A CHAVE DE FORMA SEGURA DAS PROPRIEDADES DO SCRIPT
const props = PropertiesService.getScriptProperties();
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');

const EMBEDDING_MODEL = 'models/text-embedding-004';

const GENERATIVE_MODEL = 'models/gemini-2.5-flash';

/** 📚 BASE DE CONHECIMENTO */
const BASE_TEXT = `DRA092 - ACADÊMICO | DECLARAÇÃO DE MATRÍCULA
A declaração é um modelo padrão de documento disponível para ser impresso no ambiente.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: status do período vigente,período equivalente, disciplinas matriculadas/carga horária, curso/reconhecimento, turno, atividades complementares, coeficiente de rendimento, previsão de conclusão do curso.
COMO EMITIR:
Ambiente do aluno


DESTINADA:
* Confirmação de matrícula na IES
* Cancelamento Pravaler (manual) 
* Pendência de Documento (manual) 
* ALERJ (manual) 
* Detran (manual) 
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 


* Solicitação de alteração de Dados pessoais ➡️Solicitar o protocolo de alteração de dados.
* Solicitação de informação de bolsa 100% ➡️Solicitar o protocolo para Declaração de Riocard.
* Apresentação no Jáe ➡️Solicitar o protocolo para Declaração de Riocard.
* Informativo de Modalidade Cursada ➡️Solicitar o protocolo para Declaração de Riocard.
* C.R Zerado para alunos ingressantes ➡️ O C.R (Coeficiente de Rendimento) de alunos ingressantes não é exibido, mesmo com a dispensa de disciplinas. O motivo é que o C.R só é calculado e informado para disciplinas que foram efetivamente cursadas na Unisuam, conforme o manual do aluno.
* Deseja a data da colação de grau➡️Solicitar o protocolo de declaração de conclusão de créditos apos a colação de grau.
* Deseja informações de horário de Aula/Estágio de estágio obrigatório ➡️ Solicitar o protocolo de declaração própria do estágio de acordo com o curso.
* Informações de Notas ➡️ As notas são informadas no histórico para simples conferência.
* Informação de realização de prova➡️Para solicitar a confirmação de presença na unidade, use o protocolo 'ACADÊMICO | DECLARAÇÃO DE REALIZAÇÃO DE PROVAS'. Lembre-se que este documento é válido somente para provas presenciais e não se aplica a alunos EAD.
* Retirada de dados específicos ➡️ ️Informar que é modelo padrão.


DRA027- ACADÊMICO | DECLARAÇÃO DE MATRÍCULA PARA RIO CARD
A declaração é um modelo padrão de documento disponível para ser impresso no ambiente.
CONTÉM:
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: status do período vigente, período equivalente, disciplinas matriculadas, curso, turno, previsão de conclusão do curso, tabela de pagamentos para o período vigente, Bolsa/Fies/Pravaler (caso possua)
COMO EMITIR:
Ambiente do aluno


DESTINADA:
* Confirmação de matrícula na IES
* Apresentação no Rio Card
* Informação de Modalidade EAD
* Informação de Bolsa 100%
* Informação de Pravaler/FIES
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 


* Solicitação de alteração de Dados pessoais ➡️Solicitar o protocolo de alteração de dados
* Retirada de dados específicos ➡️ ️Informar que é modelo padrão.
* Informa que não está constando a informação de Pravaler/FIES➡️Orientar o aluno que discorda do preview, informando que a informação não consta no documento. A declaração será realizada manualmente e enviada por e-mail.Solicita o modelo 
* ALERJ ➡️Solicitar o protocolo "ACADÊMICO | DECLARAÇÃO DE MATRÍCULA", informando no esclarecimento que o modelo desejado é o ALERJ.
DRA085 - ACADÊMICO | DECLARAÇÃO DE REALIZAÇÃO DE PROVAS
Documento emitido manualmente para fornecer a confirmação de realização presencial da prova na unidade após o período de avaliações indicado no Calendário Acadêmico. Deve-se informar o nome, código da disciplina e data da avaliação para análise do comparecimento e emissão do documento.
CONTÉM:
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: status do período vigente, matrícula, curso, turno, período equivalente, disciplinas/módulos + data de realização da prova. 
COMO EMITIR:
Ambiente do aluno


DESTINADA:
* Confirmação de realização de prova na unidade
* Confirmação das provas: Integradoras e formadora[a]


DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 


* Solicitação de realização de prova EAD ➡️Não é disponibilizada devido a ser destinada à realização presencial na unidade
* Solicitação de realização de provas de períodos anteriores ➡️Não é disponibilizada
* Fora do período de prova ➡️ Não é disponibilizada, o aluno deve solicitar após a realização da prova na unidade. 


DRA021- ACADÊMICO | DECLARAÇÃO DE PAGAMENTOS (ANO ANTERIOR)
Esta declaração detalha todos os pagamentos realizados no ano anterior à solicitação. O documento não inclui juros e multas. Disponível para ser impresso no ambiente.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: CNPJ da IES, matrícula, curso, tabela de pagamentos realizados. 


DESTINADA:
* Pagamentos realizados no ano anterior.
* Imposto de renda.
* Para fins de Informe de rendimentos.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 


* Deseja alteração para os pagamentos serem informados como realizados em nome de terceiros ➡️Informar  que é o modelo padrão.
* Solicitação de pagamento para o ano atual ➡️ Solicitar o protocolo “ACADÊMICO | DECLARAÇÃO DE PAGAMENTOS (ANO ATUAL)”
* Solicita alteração do modelo ➡️ Informar que é o modelo padrão.
* Aluno ingressante que deseja os informes de pagamento ➡️ Solicitar o protocolo “ACADÊMICO | DECLARAÇÃO DE PAGAMENTOS (ANO ATUAL)”
* Divergência no pagamento ➡️ O mesmo deve discordar do preview informando o ocorrido. O DRA encaminha a solicitação para o financeiro para análise. 
* Informa que deseja o informe de outros anos➡️Solicitar o protocolo “FINANCEIRO | NOTA FISCAL ELETRÔNICA”. Ressaltamos que a declaração ACADÊMICO | DECLARAÇÃO DE PAGAMENTOS (ANO ANTERIOR) é destinado apenas ao ano anterior e que qualquer solicitação de anos anteriores deve ser realizada através de nota fiscal.
* Pagamento não identificado ➡️Não é analisado pelo DRA.
* Solicitação de envio por e-mail ➡️Informar a disponibilidade pelo ambiente.


DRA022 - ACADÊMICO | DECLARAÇÃO DE PAGAMENTOS (ANO ATUAL)
Esta declaração detalha todos os pagamentos realizados no ano atual. O documento não inclui juros e multas. Disponível para ser impresso no ambiente.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, curso, turno, semestre letivo vigente, disciplinas/módulo atual, período equivalente, quantidade de períodos para a conclusão do curso, tabela de pagamentos realizados. 


DESTINADA:
* Pagamentos realizados no ano anterior.
* Imposto de renda.
* Para fins de Informe de rendimentos.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 


* Solicitação para informar que os pagamentos foram realizados em nome de terceiros ➡️Informar que é o modelo padrão.
* Solicita alteração de dados ➡️ Informar que é o modelo padrão.
* Divergência no pagamento ➡️ O mesmo deve discordar do preview informando o ocorrido. O DRA encaminha a solicitação para o financeiro para análise. 
* Informa que deseja outros anos➡️Solicitar o protocolo “FINANCEIRO | NOTA FISCAL ELETRÔNICA”
* Pagamento não identificado ➡️Solicitar o protocolo “FINANCEIRO | ANÁLISE DE PAGAMENTO NÃO IDENTIFICADO”
* Solicitação de envio por e-mail ➡️Informar a disponibilidade pelo ambiente.
DRA012 - ACADÊMICO | DECLARAÇÃO DE CONCLUSÃO DE CRÉDITOS
Este documento é uma declaração dirigida aos alunos que concluíram todos os créditos necessários para a graduação.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, informações sobre o período de início e término do curso, seu reconhecimento, duração, carga horária e a data da Colação de Grau ( que será informada após a participação do(a) aluno(a) na cerimônia ) antes da confirmação de participação a declaração será fornecida sem a data da colação. 


DESTINADA:
* Confirmação de conclusão de todos os créditos do aluno no curso. 
* Confirmação de presença na colação de grau.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Deseja a data de colação de grau ➡️Será informada após a confirmação de presença do aluno (através da ata assinada no ato da colação) no sistema. ( Geralmente até 2 dias úteis após a colação) 
* Deseja que seja informada a data futura da colação de grau para adiantar a pós graduação (especialização) ➡️Informar a situação ao departamento. 
* Deseja que seja informada a data futura da colação de grau ➡️ Solicitar a declaração após a colação de grau. Apenas se for o caso de adiantar a especialização informar a situação ao departamento. 
DRA024 - ACADÊMICO | DECLARAÇÃO DE MATRÍCULA COM CALENDÁRIO DE PROVAS
Fornece as datas das avaliações programadas para o semestre atual.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, status do período vigente, curso, turno, disciplinas matriculadas, período equivalente, tabela com as datas de avaliações de cada disciplina.


DESTINADA:
* Informação das datas de avaliações programadas para o semestre atual.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Confirmação de presença na prova ➡️Para obter a confirmação de presença na unidade para a realização da prova, você pode solicitar o protocolo 'ACADÊMICO | DECLARAÇÃO DE REALIZAÇÃO DE PROVAS'. É importante destacar que este documento é destinado apenas para provas presenciais e não se aplica a alunos na modalidade EAD
* Aluno modular que informa não ter notas ➡️Informamos que a declaração para alunos modulares será realizada manualmente. É necessário que o aluno discorde do preview informando que está em branco. O documento será enviado por e-mail.
DRA028 - ACADÊMICO | DECLARAÇÃO DE MATRÍCULA COM HORÁRIO DE AULA (GRADUAÇÃO)
Esta declaração informa o horário das disciplinas nas quais o aluno está matriculado no semestre atual. Ressaltamos que para disciplinas realizadas no formato a distância não irá constar horários definidos, devido a flexibilidade da mesma.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, status do período vigente, curso, disciplinas/módulo atual, período equivalente.


DESTINADA:
* Informar o horário das disciplinas nas quais o aluno está matriculado.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Grade/ Quadro de Horário ➡️ ️ Não é analisado pelo DRA.
DRA004 - ACADÊMICO | DECLARAÇÃO DE PONTUAÇÃO NO VESTIBULAR (Manual) 
Este documento é destinado a candidatos que, tendo sido aprovados no vestibular, não realizaram a matrícula e desejam utilizar essa aprovação em outra Instituição de Ensino Superior (IES).
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: ano e período em que foi prestada a prova, curso e notas.
COMO EMITIR:
Aberto internamente


DESTINADA:
* Candidatos aprovados que não realizaram a matrícula e desejam utilizar essa aprovação em outra Instituição de Ensino (Vestibular comum e Vestibular Solidário)


DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 




DRA008 - ACADÊMICO | SOLICITAÇÃO DE TROCA ACADÊMICA PELO AMBIENTE ALUNO
Este protocolo é gerado automaticamente para os alunos que solicitam a troca acadêmica por meio do menu disponível no ambiente do aluno, dentro do período estabelecido no calendário acadêmico.
CONTÉM:
Não é um documento.
COMO EMITIR:
Através do ambiente do aluno.


DESTINADA:
* Trocas acadêmicas de turno, unidade, curso e modalidade.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* trocas de turma ➡️ Não é realizado pelo DRA.
* Trocas de Modulos ➡️ Não é realizado pelo DRA, entrar em contato com o coordenador.
* Dispensas ➡️ entrar em contato com o coordenador.[b]
* cancelamento da solicitação➡️ o aluno solicitar através do canal de atendimento ao aluno.
* cancelamento da solicitação➡️deve-se alterar o status para “cancelado” não “finalizado” devido ao monitoramento do mesmo.
* cancelamento da solicitação➡️não pode ser aceito após a troca ser realizada, neste é caso é necessário solicitar novamente a troca para os dados anteriores. 
* Aluno com o status “pré-inscrito” ➡️será atualizado automaticamente em até um dia, caso a troca tenha sido realizada e após um dia o status não tenha sido alterado a alteração manual para “matriculado” deve ser realizada pela secretaria. 
* Aluno arrependido da solicitação ➡️ é necessário o aluno solicitar novamente a troca para os dados anteriores. 
* Alteração do valor da bolsa D-FINAM ➡️ Após a realização da troca a bolsa é lançada automaticamente, em cima do valor do curso, ou seja, caso o curso seja alterado o valor da bolsa também será. Para retornar aos valores anteriores é necessário solicitar a troca para os dados anteriores. 
* Bolsa Carência 100%➡️ Após a confirmação da troca, o lançamento será realizado pelo departamento de bolsa. O departamento de bolsa informará o lançamento no próprio protocolo de troca.
* Bolsa Legal ➡️ Após a confirmação é necessário informar ao RH.
* Bolsa estagiários ➡️ Após a confirmação é necessário informar ao RH.
* Troca indeferida ➡️ Ressaltamos que no parecer interno são informados os módulos disponíveis no momento da análise de troca. A indicação "não cumpre o pré-requisito" é utilizada para módulos em que o aluno não pode ser inserido por não ter cursado as disciplinas necessárias. A indicação "já cursado" é utilizada para módulos/períodos equivalentes (no ato da troca) em que o aluno é considerado aprovado. 
* Trocas autorizadas ➡️ Deve-se abrir o protocolo internamente, informando qual departamento autorizou, a unidade, curso e turno de destino (Exemplo: Troca autorizada pelo departamento de Bolsa. Dados de Destino: BS / Administração / Noite) 
* Alunos com Bolsa 100% (Vestibular Solidário) ➡️Conforme as novas regras válidas a partir de 2025/2, os alunos apenas podem solicitar troca de turno e de unidade. Ressalto que trocas de polo não são mais permitidas.
* trocas de turma ➡️ Não é analisado pelo DRA.
DRA014 - ACADÊMICO | SOLICITAÇÃO DE TROCA ACADÊMICA APÓS O PRAZO
Protocolo para solicitação de trocas acadêmicas pelo ambiente do aluno(a) após o encerramento do prazo estipulado no Calendário Acadêmico. Para realização desse processo, o(a) aluno(a) deve apresentar um documento que comprove a necessidade da troca.
CONTÉM:
Não é um documento.
COMO EMITIR:
Através do ambiente do aluno.


DESTINADA:
* Trocas acadêmicas de turno, unidade e modalidade para o mesmo curso
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Abertura do protocolo ➡️ A solicitação do protocolo deve ser feita através do Ambiente do Aluno, na seção Protocolo Online. É importante ressaltar que o processo é diferente da solicitação de trocas dentro no prazo, que é realizado diretamente no menu.
* Trocas de curso➡️Não são aceitas devido ao fluxo acadêmico.
* Alunos com Bolsa 100% (Vestibular Solidário) ➡️Conforme as novas regras válidas a partir de 2025/2, os alunos apenas podem solicitar troca de turno e de unidade. Ressalto que trocas de polo não são mais permitidas.
* Trocas autorizadas ➡️ Deve-se abrir o protocolo internamente, informando qual departamento autorizou, a unidade, curso e turno de destino (Exemplo: Troca autorizada pelo departamento de Bolsa. Dados de Destino: BS / Administração / Noite) 
* trocas de turma ➡️ Não é realizado pelo DRA.
DRA082- ACADÊMICO | DECLARAÇÃO DE MATRÍCULA / ENADE
Documento destinado a estudantes transferidos que necessitam comprovar sua situação no ENADE, caso essa informação não conste no Histórico de Transferência.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, curso, turno, ano de ingresso na instituição com a situação do ENADE.  
COMO EMITIR:
Aberto internamente


DESTINADA:
* estudantes transferidos que não consta situação de ENADE no Histórico de Transferência.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Alunos que receberam o histórico de transferência sem a informação de enade ➡️ Informar ao departamento responsável para a abertura interna do protocolo.
DRA013/DRA018 - ATIVIDADE COMPLEMENTAR
Lançamento das horas de atividades complementares.
CONTÉM: 
Não é um documento
COMO EMITIR:
Ambiente do aluno


DESTINADA:
* Atividades complementares
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* aluno com matrícula anterior que deseja aproveitar as atividades complementares novamente ➡️ Para o aproveitamento de atividades realizadas em outra instituição de ensino superior ou na Unisuam, solicitar o protocolo "RELACIONAMENTO | TRANSFERÊNCIA DE ATIVIDADE COMPLEMENTAR"
* Modelo de RAC[c]
* Solicita urgência na análise das horas complementares ➡️ Deve apresentar o comprovante de urgência. 
* Atividades realizadas internamente ➡️ As participações em eventos online realizados pela Extensão/Pra Quem Faz/Pólen, bem como nas lives oferecidas oficialmente pelos cursos, já estão sendo registradas no sistema. Os alunos que participarem dessas atividades terão as suas horas registradas pelo próprio setor responsável
* Pesquisa e Prática Pedagógica  ➡️ As atividades de Pesquisa e Prática Pedagógica não valem como atividades complementares ou vice‐versa. Cada uma tem a sua validade.
* graduação anterior em outra IES ➡️ Solicitar o protocolo de aproveitamento de “RELACIONAMENTO | APROVEITAMENTO DE DISCIPLINA EXTERNA COMO ATIVIDADE COMPLEMENTAR”, informar a disciplina desejada que serão analisadas para aproveitamento.
* Trabalho nas eleições ➡️ Para que a participação possa ser aproveitada como horas complementares, é preciso aguardar os dias do evento e a realização do mesmo para fazer a apresentação da declaração de participação, que é entregue no final de cada turno. 
* Aproveitamento de disciplinas concluídas em uma graduação anterior ➡️ solicitar o protocolo “o protocolo de aproveitamento de RELACIONAMENTO | APROVEITAMENTO DE DISCIPLINA INTERNA COMO ATIVIDADE COMPLEMENTAR” informar a disciplina desejada que serão analisadas para aproveitamento.
DRA010- ACADÊMICO | HISTÓRICO ESCOLAR PARCIAL DO CURSO DE GRADUAÇÃO
 emissão do Histórico Parcial do aluno(a) de graduação
CONTÉM: 
O documento inclui informações sobre: dados pessoais, forma de ingresso, período de ingresso, disciplinas em curso, aprovadas e dispensadas (quando aplicável é informado a IES onde foi cursada), carga horária, grau, Coeficiente de Rendimento (CR) por período e CR global, Enade ingressante, atividades complementares, assinatura digital, QR Code. 


COMO EMITIR:
Solicitação através do ambiente do aluno e após o pagamento de emissão. 


DESTINADA:
* Entrega para estágios
* Entrega ao trabalho
* Para realização de cursos
* Quando o histórico de simples conferência não é aceito devido a necessidade da assinatura digital
* Para obter dispensas em outra faculdade que fazem simultânea. 
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* solicitam para transferência para outra IES ➡️ Solicitação de Análise de Encerramento.
* disciplina dispensadas fora do cálculo do C.R ➡️disciplinas dispensadas não são computadas no cálculo do CR
* disciplinas reprovadas ➡️ não são informadas. 
* Disciplinas cursadas em outro curso (troca acadêmica ou cursada em outra matrícula) ➡️ são informadas no enriquecimento curricular
* curso sem reconhecimento ➡️ será aberto o protocolo “DECLARAÇÃO PARA CURSOS SEM INTEGRALIZAÇÃO CURRICULAR” internamente e disponibilizado junto a entrega do histórico. 
* Aluno com o status “formado” ➡️ deve aguardar a documentação final.
* Aluno com o status “trancado” ➡️o documento é emitido normalmente.
* Aluno com o status “Não matriculado” ➡️o documento é emitido normalmente.
* Aluno com o status “transferido” ➡️é necessário o aluno confirmar se deseja realmente o histórico parcial pois o mesmo não é para fins de transferência. 
* Aluno com o status “cancelado” ➡️ é necessario abrir o ticket para a disponibilização do histórico de simples conferência. 
* Aluno com o status “jubilado” ➡️o documento é emitido normalmente.
* aluno sem acesso ao ambiente ➡️É necessario abrir o ticket para a disponibilização do histórico de simples conferência. 
DRA096 - ACADÊMICO | HISTÓRICO PARA FINS DE TRANSFERÊNCIA
Emissão do Histórico Escolar válido para Transferência do aluno para outra Instituição de Ensino Superior.
CONTÉM: 
O documento inclui informações sobre: dados pessoais, forma de ingresso, período de ingresso, disciplinas em curso, aprovadas e dispensadas (quando aplicável é informado a IES onde foi cursada), carga horária, grau, Coeficiente de Rendimento (CR) por período e CR global, Enade ingressante, atividades complementares, assinatura digital, QR Code. 
COMO EMITIR:
Aberto automaticamente após o deferimento do protocolo de transferência.


DESTINADA:
* Fins de Transferência para outra IES.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Não obteve nenhuma aprovação (aluno sem aproveitamento de disciplina)  ➡️ O aluno deve abrir o protocolo “Financeiro Devolução de Importância Paga” e informar os dados bancários no esclarecimento da solicitação.
* curso sem reconhecimento ➡️ será aberto o protocolo “DECLARAÇÃO PARA CURSOS SEM INTEGRALIZAÇÃO CURRICULAR” internamente e disponibilizado junto a entrega do histórico. 
DRA114 - ACADÊMICO | DECLARAÇÃO DE AUTENTICIDADE DE DIPLOMAS
Autêntica as informações do diploma. 
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, curso, reconhecimento do curso, data da colação de grau, dados de expedição do diploma, informações de credenciamento da instituição, QRCode.
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* autenticação do diploma expedido.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* O aluno informa que a documentação final não abre ➡️verificar através do link (https://www.unisuam.edu.br/diploma-online/) se realmente não está abrindo. Caso não abra informar ao departamento. 
* O aluno informa que a documentação final está com erro ➡️verificar através do link (https://www.unisuam.edu.br/diploma-online/) se realmente está com erro. Caso realmente esteja errado informar ao departamento. 
* Documento com dados faltando (em branco) ➡️ informar ao departamento. 


DRA079 - ACADÊMICO | DECLARAÇÃO DE REALIZAÇÃO DE ESTAGIO/ENFERMAGEM
Declaração para os alunos do curso de Enfermagem que estão atualmente matriculados no Estágio Curricular.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, curso, turno, status do período vigente, período que está cursando, nome da disciplina obrigatória, data de início e data previsão de conclusão da mesma, dia, turno e local da realização do estágio.
COMO EMITIR:
Através do ambiente do aluno.


DESTINADA:
* Confirmação de realização de estágio obrigatório.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Abertura interna do protocolo ➡️É necessário abrir o protocolo no departamento da coordenação “COORDENAÇÃO DO CURSO DE ENFERMAGEM”. 
* Disponibilização do documento ➡️ será disponibilizado para o e-mail cadastrado no sistema. 


DRA020 - ACADÊMICO | DECLARAÇÃO DE HORÁRIO DE ESTÁGIO DE PSICOLOGIA
Esta declaração destina-se aos alunos do curso de Psicologia que necessitam de um documento que contenha o horário de realização do estágio.
CONTÉM: 
Informa os dados pessoais e dados acadêmicos gerais do aluno, tais como: matrícula, curso, turno, status do período vigente, período que está cursando, nome da disciplina obrigatória, carga horária da disciplina e carga horária total da estrutura curricular.
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* Comprovação da carga horária de estágio. 
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Abertura interna do protocolo ➡️É necessário abrir o protocolo no departamento da coordenação “COORDENAÇÃO DO CURSO DE PSICOLOGIA”. 
* Disponibilização do documento ➡️ será disponibilizado para o e-mail cadastrado no sistema. 
DRA135 - ACADÊMICO | DOCUMENTOS FINAIS (ANÁLISE PRÉVIA PARA EMISSÃO/REEMISSÃO DE HISTÓRICO FINAL E/OU DIPLOMA)
Solicitação de documentação final, com a abertura do protocolo correto de acordo com a situação do aluno.
CONTÉM: 
Não é um documento.
COMO EMITIR:
Através do ambiente do aluno, devendo inserir um documento de identificação atualizado. 


DESTINADA:
* Abertura correta dos protocolos solicitados
* documentação final de 1º via com ou sem ônus 
* documentação final de 2º via com ou sem ônus
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* Abertura interna de protocolo➡️ É necessário solicitar um documento atualizado. No protocolo, informe todos os dados que você conseguir da época em que o aluno estava matriculado, como curso, matrícula e nome completo. O nome é especialmente importante, pois é comum que haja mudanças, principalmente para mulheres, e qualquer divergência pode impedir a localização do cadastro no sistema antigo.
* Aluno jubilado ➡️ Para que possamos solicitar o protocolo em nome do aluno, é preciso verificar se ele realmente concluiu todos os créditos. É importante fazer essa checagem, pois, apesar de alguns alunos jubilados terem concluído a formação, pode haver casos de outros que não finalizaram todos os créditos obrigatórios.
DRA043 - COLAÇÃO ANTECIPADA[d]
Colação de grau antecipada, é destinada a todos(as) que precisam Colar Grau antes da data prevista para a Colação Regular.
CONTÉM: 
Não é um documento
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* x
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* comprovação de necessidade para a colação de grau antecipada ➡️É necessário que, na abertura do protocolo, seja anexado um documento que comprove essa necessidade. A lista de documentos válidos é informada na Agenda de Colação de Grau.
* data para colação de grau antecipada ➡️ é informada previamente na Agenda de Colação de Grau ao final de todos os semestres disponível na intranet (https://intranet.unisuam.edu.br/intranetv2/index.php?option=com_content&view=category&id=167&Itemid=276)
DRA069 - COLAÇÃO REGULAR
é destinada a todos(as) que concluíram os créditos obrigatórios. 


CONTÉM: 
Não é um documento
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* x
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* data para colação de grau regular ➡️ é informada previamente na Agenda de Colação de Grau ao final de todos os semestres disponível na intranet (https://intranet.unisuam.edu.br/intranetv2/index.php?option=com_content&view=category&id=167&Itemid=276)
* 

DRA003 - COLAÇÃO ESPECIAL
é destinada a todos(as) que concluíram os créditos obrigatórios. [e]


CONTÉM: 
Não é um documento
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* x
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* data para colação de grau especial ➡️ é informada previamente na Agenda de Colação de Grau ao final de todos os semestres disponível na intranet (https://intranet.unisuam.edu.br/intranetv2/index.php?option=com_content&view=category&id=167&Itemid=276)


DRA045 - ANÁLISE DOCUMENTAL DE PROVÁVEL CONCLUINTE
O sistema gera automaticamente este protocolo para analisar toda a documentação do(a) aluno(a) matriculado no último período. Ele detalha todas as pendências que poderiam impedir a Colação de Grau.
CONTÉM: 
Não é um documento.
COMO EMITIR:
Aberto internamente.


DESTINADA:
* Protocolo gerado para analisar toda a documentação do(a) aluno(a) matriculado no último período onde são informadas todas as pendências que poderiam impedir a Colação de Grau.


DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* entrega da exigência ➡️Os documentos devem ser entregues pelo protocolo "Relacionamento I Entrega de Documentação em Exigência". Após inserir os arquivos no SAGA e finalizar o protocolo de exigência, é necessário retornar ao protocolo de análise de provável concluinte e alterar seu status para "aguardando atendimento". Isso fará com que o protocolo volte a ser exibido no relatório para a devida análise.
* Documento ilegível ➡️ Caso a leitura dos dados principais do documento não seja possível, a solicitação deve ser indeferida. Para dar continuidade, é preciso solicitar ao aluno que envie uma nova cópia do documento, desta vez com as informações claras e visíveis.
* Caso tenha sido realizada a entrega e protocolo ainda não tenha sido atendido ➡️ Verifique se o protocolo de análise documental voltou para o status "aguardando atendimento". Se ainda não estiver nesse status, é necessário avisar o setor de relacionamento para que eles façam a alteração.Essa ação é fundamental para que o protocolo possa ser analisado.Caso esteja com o status correto, favor aguardar o prazo. 
* Solicitação de urgência ➡️solicitar o comprovante de urgência e após a entrega informar ao departamento.


DRA031 - ACADÊMICO | CÓPIA DE DOCUMENTOS
Este protocolo destina-se à solicitação de cópias de documentos entregues no ato da matrícula.
CONTÉM: 
Não é um documento.
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* Entrega da cópia dos documentos pessoais e de ensino médio entregues para realizar a matrícula.
DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* documentos entregues na matrícula do solidário ➡️ Documentação Pessoal é entregue 
* documentação de pós graduação ➡️
* documentação de mestrado[f]
* entrega dos documentos ➡️Os documentos localizados serão enviados por e-mail
* Caso não seja encontrada a cópia ➡️ é realizada a busca na pasta física, caso seja encontrado os documentos originais será aberto o protocolo de devolução de documentos. 
* solicitação de cópia de documentos finais ➡️não são enviadas cópias de documentos finais ou parciais.


DRA006 - ACADÊMICO | DEVOLUÇÃO DE DOCUMENTOS
Este protocolo é direcionado para a devolução de documentos relacionados a matrículas antigas que possam ter sido retidos na pasta do(a) aluno(a), ou para alunos que não retiraram o histórico escolar final após a colação e desejam uma avaliação das condições do documento para liberação. Ressaltamos que nem todos os documentos é obrigatório realizar a guarda permanente, que certos documentos há um tempo limite de acordo com a Tabela de Temporalidade e Destinação
CONTÉM: 
Não é um documento.
COMO EMITIR:
Através do ambiente do aluno


DESTINADA:
* entrega na unidade dos documentos pessoais ou acadêmicos que possam ter sido retidos no ato da matrícula. 
* entrega na unidade do histórico final emitido que não foi retirado.
* entrega na unidade do diploma emitido que não foi retirado.


DÚVIDAS COMUNS ➡️ ORIENTAÇÃO 
* alunos a partir de 2013➡️ Não há pasta física devido a solicitação do documento apenas para escaneamento e inserimento no dossiê acadêmico digital com a devolução dos mesmo no ato da matrícula, desta forma não há documentação para ser devolvida.




[a]verificar se são para as duas
[b]como orientar
[c]tem como colocar arquivo na IA ?
[d]verificar se ainda tem alguma duvida recorrente
[e]ver o conceito da colação especial depois
[f]ver como orientar depois
`;


/***************************************************
 * 🔧 FUNÇÕES AUXILIARES
 ***************************************************/

/**
 * Divide um texto longo em pedaços menores (chunks).
 * @param {string} text O texto a ser dividido.
 * @param {number} size O tamanho máximo de cada pedaço.
 * @returns {string[]} Um array com os pedaços de texto.
 */
function chunkText(text, size = 1500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/**
 * Calcula a similaridade de cosseno entre dois vetores.
 * @param {number[]} a Vetor A.
 * @param {number[]} b Vetor B.
 * @returns {number} A similaridade (entre -1 e 1).
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/***************************************************
 * 🧠 EMBEDDINGS (VETORIZAÇÃO DE TEXTO)
 ***************************************************/

/**
 * Gera o embedding (vetor numérico) para um dado texto usando a API do Gemini.
 * @param {string} text O texto para gerar o embedding.
 * @returns {number[]} O vetor de embedding ou um array vazio em caso de erro.
 */
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
    const response = UrlFetchApp.fetch(url, options);
    const raw = response.getContentText();
    const data = JSON.parse(raw);

    if (data.error) {
      Logger.log(`❌ Erro na API Embedding: ${data.error.message}`);
      return [];
    }
    
    return data?.embedding?.values || [];
  } catch (e) {
    Logger.log("❌ Erro ao gerar embedding: " + e);
    return [];
  }
}

/***************************************************
 * 🤖 LÓGICA PRINCIPAL DO CHAT
 ***************************************************/

/**
 * Encontra os pedaços de texto mais relevantes da base de conhecimento para uma pergunta.
 * @param {string} pergunta A pergunta do usuário.
 * @returns {string} O texto de contexto mais relevante.
 */
function encontrarContextoRelevante(pergunta) {
  const cache = CacheService.getScriptCache();
  
  // 1. Gera o embedding da pergunta
  const perguntaEmbedding = generateEmbedding(pergunta);
  if (perguntaEmbedding.length === 0) {
    return "Erro ao analisar a pergunta.";
  }

  // 2. Divide a base de texto em pedaços
  const chunks = chunkText(BASE_TEXT);
  let melhorChunk = "";
  let maiorSimilaridade = -1;

  // 3. Itera sobre cada pedaço para encontrar o mais similar
  chunks.forEach((chunk, index) => {
    const cacheKey = `embedding_chunk_${index}`;
    let chunkEmbedding = JSON.parse(cache.get(cacheKey));

    // Se não estiver no cache, gera e salva
    if (!chunkEmbedding) {
      Logger.log(`Gerando embedding para o chunk ${index}...`);
      chunkEmbedding = generateEmbedding(chunk);
      if (chunkEmbedding.length > 0) {
        cache.put(cacheKey, JSON.stringify(chunkEmbedding), 21600); // Salva por 6 horas
      }
    }

    if (chunkEmbedding && chunkEmbedding.length > 0) {
      const similaridade = cosineSimilarity(perguntaEmbedding, chunkEmbedding);
      if (similaridade > maiorSimilaridade) {
        maiorSimilaridade = similaridade;
        melhorChunk = chunk;
      }
    }
  });

  Logger.log(`Melhor similaridade encontrada: ${maiorSimilaridade}`);
  return melhorChunk;
}

/**
 * Gera uma resposta para a pergunta do usuário usando o contexto encontrado.
 * @param {string} pergunta A pergunta do usuário.
 * @returns {string} A resposta gerada pela IA.
 */
function responderPergunta(pergunta) {
  // Encontra o contexto relevante na base de conhecimento
  const contexto = encontrarContextoRelevante(pergunta);
  
  if (contexto.includes("Erro")) {
    return contexto;
  }
  if (!contexto) {
     return "Não foi possível encontrar informações relevantes para responder à sua pergunta.";
  }

  // Monta o prompt para a IA
  const prompt = `
    Você é um assistente virtual especialista nos procedimentos do DRA.
    Use estritamente as informações do CONTEXTO abaixo para responder à PERGUNTA.
    Não invente informações. Se a resposta não estiver no contexto, diga "Não encontrei essa informação no documento.".
    Seja direto e claro na sua resposta.

    ---
    CONTEXTO:
    ${contexto}
    ---
    PERGUNTA:
    ${pergunta}
  `;

  // Chama a API Generativa
  const url = `https://generativelanguage.googleapis.com/v1beta/${GENERATIVE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const rawResponse = response.getContentText();
    Logger.log("🔹 Retorno da API Gemini (Generate):");
    Logger.log(rawResponse);

    const data = JSON.parse(rawResponse);
    
    if (data.error) {
       Logger.log(`❌ Erro da API Gemini: ${data.error.message}`);
       return `Erro ao chamar a API: ${data.error.message}`;
    }

    const resposta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return resposta || "Não foi possível gerar uma resposta.";
  } catch (e) {
    Logger.log('❌ Erro na chamada da API Generativa: ' + e);
    return 'Erro ao gerar resposta. Verifique sua conexão ou chave.';
  }
}

/***************************************************
 * ✅ FUNÇÃO DE TESTE
 ***************************************************/
function testarChat() {
  const resposta = responderPergunta("Como emitir a declaração de matrícula?");
  Logger.log("💬 Resposta da IA:");
  Logger.log(resposta);
}

/***************************************************
 * 🔍 FUNÇÃO DE DIAGNÓSTICO: LISTAR MODELOS
 ***************************************************/

/**
 * Executa esta função para listar no Log todos os modelos Gemini
 * disponíveis para a sua chave de API.
 */
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
    
    // Formata a saída para ser mais legível
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
 * 🌐 FUNÇÃO DE ENTRADA DO APLICATIVO WEB
 ***************************************************/

/**
 * @param {Object} e O parâmetro do evento da requisição GET.
 * @returns {HtmlOutput} O conteúdo HTML da página.
 */
function doGet(e) {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('index');
  
  // Define o título que aparecerá na aba do navegador
  htmlOutput.setTitle('Assistente DRA - UNISUAM');
  
  // Adiciona a meta tag de viewport para garantir que o layout funcione bem em celulares
  htmlOutput.addMetaTag('viewport', 'width=device-width, initial-scale=1');

  return htmlOutput;
}