# Assessoria Express - Sistema de Gestão de Personal Shopper & Financeiro Pessoal

Sistema web completo, moderno e responsivo desenvolvido especialmente para gestão de assessoria de compras (intermediação de roupas, tênis e vestuário com comissão fixa por peça) integrado a um controle de finanças pessoais com cálculo de saldo líquido.

---

## 🎯 Funcionalidades Principais

### 1. Módulo de Vendas & Assessorias
- **Cadastro completo de pedidos**: Nome do cliente, fornecedor (opcional), descrição das peças, tipo (tênis, roupa, blusa, outro), quantidade, valor unitário de comissão configurável, cálculo dinâmico da comissão total, datas de pedido e pagamento, e observações.
- **3 Status de Pagamento Inteligentes**:
  - 🟡 **Pendente**: Cliente fez o pedido mas ainda não enviou nenhum valor.
  - 🔴 **Atrasado**: Cliente já pagou o fornecedor pelas peças, mas ainda não pagou a taxa de comissão da assessoria.
  - 🟢 **Pago**: Cliente quitou a compra e a comissão da assessoria.
- **Ações Rápidas**: Alterne o status do pedido diretamente na listagem em 1 clique (ex: marcar rapidamente como pago ao receber o Pix).
- **Filtros Avançados**: Filtre por status (Todos, Pendentes, Atrasados, Pagos), fornecedor, período de datas ou busca por texto.
- **Métricas & Ranking**: Total de comissões pagas, pendentes e atrasadas no mês, total de peças vendidas e ranking dos clientes mais compradores.

### 2. Módulo de Financeiro Pessoal
- **Lançamento de Despesas Diárias**: Descrição, valor em R$, data e categoria.
- **Categorias Personalizáveis com Cores**: Alimentação, Investimento, Banheiro (uso de banheiro pago em centros comerciais/shoppings), Transporte e possibilidade de criar novas categorias livremente com seletor de cores.
- **Dashboard Financeiro**: Total gasto no mês, gráfico de rosca com distribuição por categoria e histórico de despesas.
- **Cálculo de Saldo Líquido Real**: Subtração automática das comissões recebidas menos as despesas diárias para você saber exatamente quanto sobrou no bolso.

### 3. Dashboard Consolidado (Visão Geral)
- **Cards de Resumo do Mês**: Comissões Recebidas, Gastos Pessoais, Saldo Líquido Real e Valores a Receber (Pendentes + Atrasados).
- **Lista de Atenção (Cobrança)**: Destaque imediato dos pedidos pendentes e atrasados com botão de 1 clique para "Marcar Pago".
- **Gráfico Comparativo**: Gráfico de barras comparando os últimos 6 meses (Comissões vs Gastos).

### 4. Responsividade & Mobile-First
- Projetado para funcionar com alta performance em **smartphones** (com barra de navegação inferior estilo app nativo e botão de ação rápida FAB) e **computadores**.
- Moeda formatada no padrão brasileiro (`R$ 1.234,56`) e datas em `DD/MM/AAAA`.

---

## 🔑 Credenciais de Acesso Inicial

- **URL Local**: `http://localhost:3000`
- **Usuário padrão**: `admin`
- **Senha padrão**: `admin123`

*(Você pode alterar sua senha a qualquer momento na aba "Categorias & Ajustes").*

---

## 🚀 Como Executar o Sistema

1. Abra o prompt de comando ou PowerShell na pasta do projeto:
   ```bash
   node server.js
   ```
   *Ou dê um duplo clique no arquivo `start.bat` no Windows.*

2. Abra o seu navegador e acesse:
   ```
   http://localhost:3000
   ```

---

## 🛠️ Tecnologias Utilizadas

- **Runtime**: Node.js (com SQLite nativo `node:sqlite` de alta performance)
- **Frontend**: HTML5, Tailwind CSS, Lucide Icons, Chart.js
- **Segurança**: Criptografia de senhas com PBKDF2/SHA-512 e sessões seguras com tokens
- **Persistência**: Arquivo `dados/banco.db` com modo WAL ativo e suporte a backup JSON/CSV
