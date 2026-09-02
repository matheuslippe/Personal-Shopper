# 🛍️ Assessoria Express — Sistema de Gestão de Personal Shopper & Portal do Cliente

Sistema web completo, seguro e responsivo desenvolvido especialmente para **Personal Shoppers e Assessorias de Compras** (intermediação de roupas, calçados e vestuário em polos como Brás, Bom Retiro e 25 de Março), com **separação de perfis entre Assessor e Cliente**, **Portal do Cliente com Dashboard próprio**, **múltiplos itens por pedido**, **rastreamento público** e **controle financeiro integrado**.

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
- **Histórico & Rastreamento**:
  - Linha do tempo visual de 3 etapas (*1. Solicitado ➔ 2. Em Compras ➔ 3. Comissão Paga*).
  - Filtros rápidos (*Todos, Pendentes e Pagos*).
  - Link de **Rastreio Público** por código único (`TRK-XXXXXX`) que pode ser compartilhado até com quem não tem conta.
- **Pagamento via Pix Integrado**:
  - Botão de pagamento em 1 clique que busca a **Chave Pix específica do assessor responsável** por aquele pedido, com valor exato da comissão e botão de cópia rápida.

---

### 💼 2. Painel de Gestão do Assessor (Personal Shopper)
- **Vendas & Assessorias**:
  - Cadastro e edição de pedidos com múltiplos itens e tipos de produtos.
  - Cálculo automático de comissão por peça e consolidado total.
  - Notificação de novas solicitações enviadas por clientes em tempo real (badge no menu).
  - 3 Status inteligentes: 🟡 **Pendente**, 🔴 **Atrasado** e 🟢 **Pago**.
  - Ações rápidas para marcar pagamentos recebidos em 1 clique.
  - Filtros avançados por status, cliente, fornecedor e período.
- **Módulo Financeiro Pessoal**:
  - Lançamento de despesas do dia a dia (alimentação, transporte, banheiro em shoppings, etc.).
  - Categorias customizáveis com paleta de cores.
  - **Saldo Líquido Real**: Dedução automática das despesas diárias sobre o faturamento de comissões.
- **Dashboard Consolidado (Visão Geral)**:
  - Faturamento mensal, despesas, saldo líquido e valores a receber.
  - Gráfico comparativo dos últimos 6 meses (Comissões vs Gastos).
  - Ranking dos clientes que mais compram.
- **Configurações & Ajustes**:
  - Definição da **Taxa Padrão de Comissão por Peça** (ex: `R$ 10,00`).
  - Cadastro da **Chave Pix do Assessor** (CPF, CNPJ, E-mail, Celular ou Chave Aleatória) exibida para seus clientes.
  - Gerenciamento de categorias de despesas.
  - Troca segura de senha.

---

## 🔒 Arquitetura & Segurança

- **Separação de Perfis (RBAC)**: Menus e rotas restritos conforme o papel (`role: 'assessor'` ou `role: 'cliente'`).
- **Isolamento Multi-Tenant**: Cada assessor visualiza exclusivamente seus próprios clientes, pedidos e finanças.
- **Criptografia Forte**: Senhas com hash `PBKDF2` (100.000 iterações com Salt criptográfico seguro).
- **Sessões Protegidas**: Tokens de sessão opacos de 64 caracteres hexadecimais com expiração automática.
- **Proteção contra Força Bruta**: Rate limiter em rotas críticas de login e cadastro.
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
│   │   └── database.js         # Driver de banco LibSQL com migrations automáticas
│   ├── middleware/
│   │   ├── auth.js             # Autenticação e validação de sessão
│   │   └── security.js         # Rate limiting e cabeçalhos HTTP de segurança
│   └── routes/
│       ├── auth.js             # Registro, login, logout e troca de senha
│       ├── client.js           # Portal do cliente, solicitações e rastreio público
│       ├── dashboard.js        # Métricas consolidadas e relatórios mensais
│       ├── expenses.js         # Lançamento e controle de despesas
│       ├── orders.js           # CRUD de pedidos com múltiplos itens
│       └── settings.js         # Configurações de taxa, categorias e dados Pix
├── test/
│   └── app.test.js             # Suíte de testes automatizados (node:test)
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

Para rodar a suíte completa de testes de API, isolamento multi-tenant, segurança e portal do cliente:

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
3. Para atualizar a aplicação, basta fazer `git push` na branch principal ou rodar o **`push_to_github.bat`**.

---

## 📄 Licença

Este projeto é desenvolvido para uso profissional em assessoria de compras e personal shopper.
