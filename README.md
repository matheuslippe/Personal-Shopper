# 🛍️ Assessoria Express — Sistema de Gestão de Personal Shopper & Portal do Cliente

Sistema web completo, seguro e responsivo desenvolvido especialmente para **Personal Shoppers e Assessorias de Compras** (intermediação de roupas, calçados e vestuário em polos comerciais como Brás, Bom Retiro e 25 de Março), com **separação de perfis entre Assessor e Cliente**, **Portal do Cliente com Dashboard próprio**, **Módulo de Agenda & Capacidade de Atendimento**, **Controle de Entrega & Despacho por Modalidade (Correios, Excursão, Transportadora e Uber)**, **múltiplos itens por pedido**, **rastreamento público** e **controle financeiro integrado**.

---

## 🌟 Principais Funcionalidades

### 👤 1. Portal Exclusivo do Cliente
- **Dashboard do Cliente**:
  - 📦 **Total de Peças Solicitadas**: Quantidade total de peças acumuladas.
  - ⏳ **Pedidos em Andamento**: Acompanhamento de pedidos ativos e status em tempo real.
  - 💳 **Pix a Pagar**: Valor consolidado de comissões pendentes de pagamento.
  - ✅ **Comissões Pagas**: Histórico de comissões quitadas.
  - 📊 **Gráfico de Peças**: Gráfico visual de distribuição de compras (Tênis, Roupas, Blusas e Outros).
- **Solicitação de Novas Compras**:
  - Auto-preenchimento do nome do cliente solicitante.
  - Seletor dinâmico do **Assessor Responsável** desejado com taxa por peça informada.
  - Adição de **múltiplas peças em um único pedido** com quantidades e descrições individuais.
  - Seletor dinâmico de **Modelo de Entrega & Despacho** com subformulários específicos.
- **Linha do Tempo em 4 Etapas**:
  1. 📝 **1. Solicitado:** Pedido registrado no sistema.
  2. 📅 **2. Data de Atendimento:** Data confirmada de compras (ou `⏳ Aguardando Aceite` se modo manual).
  3. 🛍️ **3. Em Compras:** Assessor no polo comercial realizando as compras.
  4. 💳 **4. Comissão Paga & Envio:** Quitação da assessoria e liberação para envio.
- **Perfil de Entrega Padrão (`📍 Meu Endereço Padrão`)**:
  - O cliente pode salvar sua modalidade e endereço preferidos para preenchimento automático em novas solicitações.
- **Histórico & Rastreamento**:
  - Filtros rápidos (*Todos, Pendentes e Pagos*).
  - Consulta aos dados de despacho enviados em cada pedido.
  - Link de **Rastreio Público** por código único (`TRK-XXXXXX`) que pode ser compartilhado com qualquer pessoa sem login.
- **Pagamento via Pix Integrado**:
  - Validação inteligente de pedidos pendentes com exibição dinâmica da **Chave Pix do Assessor Responsável**.

---

### 📅 2. Módulo de Agenda & Capacidade de Atendimento (Assessor)
- **Regras de Atendimento Configuráveis**:
  - **Modo Manual:** O assessor analisa novas solicitações e define/confirma a data em que fará as compras.
  - **Modo Automático:** O sistema distribui automaticamente os novos pedidos nos próximos dias livres com vagas.
  - **Capacidade Diária Máxima:** Limite de atendimentos por dia (ex: 4 clientes/dia) para evitar sobrecarga no polo comercial.
  - **Turno Padrão:** Ex: `Manhã (06h às 14h)`.
- **Painel de Solicitações Pendentes**:
  - Card de alerta em amarelo com contagem de pendências e botão **`📅 Agendar Data`** com 1 clique.
- **Calendário com Indicadores de Vagas**:
  - Visualização de todos os dias com atendimentos agendados e badges de ocupação (`🟢 2/4 Vagas` ou `🔴 Lotado`).
  - Lista completa dos clientes, peças e horários agendados para o dia selecionado.

---

### 🚚 3. Módulo de Entrega & Despacho por Modalidade
O sistema coleta e valida os dados de despacho específicos conforme a logística utilizada:

1. 📦 **Correios (PAC / Sedex):**
   - Nome Completo, CPF, Endereço Completo com CEP, Telefone/WhatsApp.
2. 🚌 **Excursão (Ônibus de Compras):**
   - Nome Completo, Telefone/WhatsApp, Cidade de Destino, Nome da Excursão, Localização do Ônibus (ex: Pátio Pari / Vautier), Horário Limite de Recebimento, Placa do Ônibus e Necessidade de Nota Fiscal (*Sim / Não*).
3. 🚚 **Transportadora:**
   - Nome da Transportadora, Ponto no Polo Comercial, Necessidade de NF (*Sim / Não*), Nome do Destinatário, CPF, Endereço de Destino com CEP e Telefone/WhatsApp.
4. 🚗 **Uber / Entrega Local (Flash):**
   - Endereço Completo de Entrega, Nome do Destinatário e Telefone de Contato.
- **📋 Copiar para WhatsApp**:
  - O Assessor conta com um botão de 1 clique que gera uma mensagem formatada e limpa para enviar diretamente ao guia da excursão, motorista ou cliente.

---

### 💼 4. Gestão Financeira & Vendas do Assessor
- **Vendas & Assessorias**:
  - Cadastro e edição de pedidos com múltiplos itens e cálculo de comissões por peça.
  - Status inteligentes: 🟡 **Pendente**, 🔴 **Atrasado** e 🟢 **Pago**.
  - Ações rápidas para marcar pagamentos recebidos e visualizar dados de despacho (`🚚`).
- **Módulo Financeiro Pessoal**:
  - Lançamento de despesas do dia a dia (alimentação, transporte, etc.).
  - Categorias customizáveis com paleta de cores.
  - **Saldo Líquido Real**: Dedução automática das despesas diárias sobre o faturamento de comissões.
- **Dashboard Consolidado (Visão Geral)**:
  - Faturamento mensal, despesas, saldo líquido e valores a receber.
  - Gráfico comparativo dos últimos 6 meses (Comissões vs Gastos).
  - Ranking dos clientes que mais compram.
- **Configurações & Ajustes**:
  - Definição da **Taxa Padrão de Comissão por Peça** (ex: `R$ 10,00`).
  - Cadastro da **Chave Pix do Assessor** exibida para seus clientes.
  - Troca segura de senha.

---

## 🔒 Arquitetura & Segurança

- **Separação de Perfis (RBAC)**: Menus e rotas restritos conforme o papel (`role: 'assessor'` ou `role: 'cliente'`).
- **Isolamento Multi-Tenant**: Cada assessor visualiza exclusivamente seus próprios clientes, pedidos e finanças.
- **Criptografia Forte**: Senhas com hash `PBKDF2` (100.000 iterações com Salt criptográfico seguro).
- **Sessões Protegidas**: Tokens de sessão opacos de 64 caracteres hexadecimais com expiração automática.
- **Proteção contra Força Bruta & Path Traversal**: Rate limiter em rotas críticas e blindagem estática no servidor HTTP.
- **Segurança HTTP**: Headers `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options` e sanitização anti-XSS.
- **Banco de Dados Híbrido**: Suporte transparente a **Turso Cloud** (LibSQL em produção no Render) e **SQLite local** (`dados/banco.db`) em desenvolvimento.

---

## 📁 Estrutura do Projeto

```
personal-shopper-system/
├── public/                     # Interface Frontend (Single Page Application)
│   ├── index.html              # Estrutura HTML responsiva (Desktop & Mobile)
│   └── app.js                  # Lógica de interface, gráficos Chart.js e chamadas de API
├── src/
│   ├── db/
│   │   ├── client.js           # Utilitários de consulta e formatação de pedidos
│   │   └── migrations.js       # Schema e migrations automáticas LibSQL
│   ├── middleware/
│   │   ├── auth.js             # Autenticação e validação de sessão com RBAC
│   │   └── security.js         # Rate limiting e cabeçalhos HTTP de segurança
│   └── routes/
│       ├── auth.js             # Registro, login case-insensitive e troca de senha
│       ├── client.js           # Portal do cliente, solicitações, perfil de entrega e rastreio
│       ├── dashboard.js        # Métricas consolidadas e relatórios mensais
│       ├── expenses.js         # Lançamento e controle de despesas
│       ├── orders.js           # CRUD de pedidos com múltiplos itens e dados de despacho
│       ├── schedule.js         # Módulo de agenda, capacidade e aceite de datas
│       └── settings.js         # Configurações de taxa, categorias e dados Pix
├── test/
│   └── app.test.js             # Suíte de 16 testes automatizados (node:test)
├── server.js                   # Servidor HTTP nativo Node.js
├── push_to_github.bat          # Script auxiliar para commit e deploy no Render
└── package.json                # Dependências e scripts de execução
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior.

### Passo a Passo
1. Clone o repositório ou navegue até a pasta:
   ```bash
   git clone https://github.com/matheuslippe/Personal-Shopper.git
   cd Personal-Shopper
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o servidor:
   ```bash
   npm start
   ```
   *(Ou execute `node server.js` ou dê um duplo clique no arquivo `start.bat` no Windows).*

4. Acesse no navegador:
   ```
   http://localhost:3000
   ```

---

## 🧪 Execução dos Testes Automatizados

Para rodar a suíte com **16 testes automatizados** cobrindo autenticação, multi-tenant, agenda, modalidades de entrega e segurança:

```bash
npm test
```

---

## ☁️ Deploy em Produção (Render / Cloud)

1. Crie um banco de dados no **[Turso](https://turso.tech)** e obtenha a URL de conexão e o Auth Token.
2. No painel do **[Render](https://render.com)**, adicione as seguintes Variáveis de Ambiente (*Environment Variables*):
   - `TURSO_DATABASE_URL`: `libsql://seu-banco.turso.io`
   - `TURSO_AUTH_TOKEN`: `seu_token_aqui`
   - `PORT`: `3000` (ou atribuído automaticamente pelo Render)
3. Para atualizar a aplicação, basta rodar o script **`push_to_github.bat`**.

---

## 📄 Licença

Este projeto é desenvolvido para uso profissional em assessoria de compras e personal shopper.
