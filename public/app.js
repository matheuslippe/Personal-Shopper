/**
 * Assessoria Express - Frontend Application Logic
 * Single Page Application com Dashboard Consolidado, Vendas & Finanças Pessoais
 */

const app = {
  // State
  token: localStorage.getItem('assessoria_token') || '',
  user: null,
  currentTab: 'overview',
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  settings: {
    default_commission: '10.00'
  },
  categories: [],
  orders: [],
  expenses: [],
  salesFilter: {
    status: 'todos',
    search: '',
    supplier: ''
  },
  expensesFilter: {
    categoryId: 'todas',
    search: ''
  },

  // Chart instances
  charts: {
    monthlyTrend: null,
    itemTypes: null,
    expenseCategories: null
  },

  // --- INITIALIZATION ---
  init() {
    this.checkAuth();
  },

  // --- AUTHENTICATION ---
  async checkAuth() {
    if (!this.token) {
      this.showAuthScreen();
      return;
    }

    try {
      const res = await this.apiGet('/api/auth/me');
      if (res && res.user) {
        this.user = res.user;
        this.hideAuthScreen();
        await this.loadInitialData();
      } else {
        this.logout();
      }
    } catch (err) {
      console.warn('Auth check failed:', err);
      this.logout();
    }
  },

  showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    lucide.createIcons();
  },

  hideAuthScreen() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    if (this.user) {
      document.getElementById('user-display').textContent = this.user.username;
      document.getElementById('user-avatar').textContent = this.user.username.slice(0, 2).toUpperCase();
    }
    lucide.createIcons();
  },

  setAuthMode(mode) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const errBox = document.getElementById('auth-error');
    const succBox = document.getElementById('auth-success');

    if (errBox) errBox.classList.add('hidden');
    if (succBox) succBox.classList.add('hidden');

    if (mode === 'register') {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
      tabRegister.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-white text-slate-900 shadow-xs transition-all';
      tabLogin.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-900 transition-all';
      document.getElementById('register-username').focus();
    } else {
      registerForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      tabLogin.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-white text-slate-900 shadow-xs transition-all';
      tabRegister.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-900 transition-all';
      document.getElementById('login-username').focus();
    }
    lucide.createIcons();
  },

  async handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-login-submit');
    const errBox = document.getElementById('auth-error');
    const succBox = document.getElementById('auth-success');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (errBox) errBox.classList.add('hidden');
    if (succBox) succBox.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = `<span>Entrando...</span>`;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha no login');
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('assessoria_token', this.token);
      this.hideAuthScreen();
      this.showToast('Login realizado com sucesso!', 'success');
      await this.loadInitialData();
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>Acessar Painel</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      lucide.createIcons();
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-register-submit');
    const errBox = document.getElementById('auth-error');
    const succBox = document.getElementById('auth-success');
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    if (errBox) errBox.classList.add('hidden');
    if (succBox) succBox.classList.add('hidden');

    if (password !== confirmPassword) {
      if (errBox) {
        errBox.textContent = 'As senhas digitadas não coincidem.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span>Criando conta...</span>`;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirmPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao cadastrar');
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('assessoria_token', this.token);
      this.hideAuthScreen();
      this.showToast('Conta criada e logada com sucesso!', 'success');
      await this.loadInitialData();
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>Criar Minha Conta</span> <i data-lucide="check" class="w-4 h-4"></i>`;
      lucide.createIcons();
    }
  },

  async handleLogout() {
    if (!confirm('Deseja realmente sair do sistema?')) return;
    try {
      await this.apiPost('/api/auth/logout', {});
    } catch (err) {}
    this.logout();
  },

  logout() {
    this.token = '';
    this.user = null;
    localStorage.removeItem('assessoria_token');
    this.showAuthScreen();
  },

  // --- API HELPER METHODS ---
  async apiRequest(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(endpoint, options);
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      this.logout();
      throw new Error('Sessão expirada');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Erro na requisição');
    }

    return data;
  },

  apiGet(endpoint) { return this.apiRequest(endpoint, 'GET'); },
  apiPost(endpoint, body) { return this.apiRequest(endpoint, 'POST', body); },
  apiPut(endpoint, body) { return this.apiRequest(endpoint, 'PUT', body); },
  apiPatch(endpoint, body) { return this.apiRequest(endpoint, 'PATCH', body); },
  apiDelete(endpoint) { return this.apiRequest(endpoint, 'DELETE'); },

  // --- LOAD INITIAL DATA & REFRESH ---
  async loadInitialData() {
    this.updateMonthLabel();
    await Promise.all([
      this.loadSettings(),
      this.loadCategories()
    ]);
    await this.refreshCurrentView();
  },

  async loadSettings() {
    try {
      const data = await this.apiGet('/api/settings');
      if (data) {
        this.settings = { ...this.settings, ...data };
        const rate = parseFloat(this.settings.default_commission || 10).toFixed(2);
        const rateEl = document.getElementById('dashboard-commission-rate');
        if (rateEl) rateEl.textContent = `R$ ${rate.replace('.', ',')}`;
        const inputEl = document.getElementById('setting-default-commission');
        if (inputEl) inputEl.value = this.settings.default_commission || '10.00';
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },

  async loadCategories() {
    try {
      this.categories = await this.apiGet('/api/categories');
      this.renderCategoryOptions();
      this.renderCategoryFilters();
      this.renderCategoriesManagement();
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  },

  // --- NAVIGATION & TABS ---
  switchTab(tabId, extraFilters = null) {
    this.currentTab = tabId;

    // Update Desktop Nav Links
    document.querySelectorAll('.nav-link').forEach(el => {
      if (el.getAttribute('data-nav') === tabId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Update Mobile Nav
    document.querySelectorAll('[data-nav-m]').forEach(el => {
      if (el.getAttribute('data-nav-m') === tabId) {
        el.classList.add('active', 'text-indigo-600', 'font-semibold');
        el.classList.remove('text-slate-400', 'font-medium');
      } else {
        el.classList.remove('active', 'text-indigo-600', 'font-semibold');
        el.classList.add('text-slate-400', 'font-medium');
      }
    });

    // Show View
    document.querySelectorAll('.view-tab').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${tabId}`);
    if (target) target.classList.remove('hidden');

    // Update Header Title
    const titles = {
      overview: { title: 'Visão Geral', sub: '| Resumo consolidado de faturamento e despesas' },
      sales: { title: 'Vendas & Assessorias', sub: '| Controle de pedidos, clientes e comissões' },
      expenses: { title: 'Financeiro Pessoal', sub: '| Controle de gastos do dia a dia e saldo líquido' },
      settings: { title: 'Categorias & Ajustes', sub: '| Gerenciamento de categorias, comissões e segurança' }
    };
    if (titles[tabId]) {
      document.getElementById('tab-title').textContent = titles[tabId].title;
      document.getElementById('tab-subtitle').textContent = titles[tabId].sub;
    }

    if (extraFilters && tabId === 'sales' && extraFilters.status) {
      this.setSalesStatusFilter(extraFilters.status);
    } else {
      this.refreshCurrentView();
    }

    lucide.createIcons();
  },

  async refreshCurrentView() {
    if (this.currentTab === 'overview') {
      await this.loadOverviewDashboard();
    } else if (this.currentTab === 'sales') {
      await this.loadOrders();
      await this.loadSalesDashboardMetrics();
    } else if (this.currentTab === 'expenses') {
      await this.loadExpenses();
      await this.loadExpensesDashboardMetrics();
    } else if (this.currentTab === 'settings') {
      this.renderCategoriesManagement();
    }
  },

  // --- MONTH SELECTOR ---
  changeMonth(delta) {
    const [yearStr, monthStr] = this.currentMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + delta;

    if (month > 12) {
      month = 1;
      year += 1;
    } else if (month < 1) {
      month = 12;
      year -= 1;
    }

    this.currentMonth = `${year}-${String(month).padStart(2, '0')}`;
    this.updateMonthLabel();
    this.refreshCurrentView();
  },

  updateMonthLabel() {
    const [yearStr, monthStr] = this.currentMonth.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    document.getElementById('current-month-label').textContent = monthName;
  },

  // ================= VIEW 1: OVERVIEW DASHBOARD =================
  async loadOverviewDashboard() {
    try {
      const data = await this.apiGet(`/api/dashboard/overview?month=${this.currentMonth}`);

      // Cards
      document.getElementById('stat-paid-comm').textContent = this.formatCurrency(data.paidCommission);
      document.getElementById('stat-pieces-sold').textContent = data.piecesSold;
      document.getElementById('stat-total-expenses').textContent = this.formatCurrency(data.totalExpenses);
      document.getElementById('stat-expenses-count').textContent = data.expensesCount;

      // Net Balance styling
      const netEl = document.getElementById('stat-net-balance');
      const netHint = document.getElementById('stat-net-hint');
      const netWrap = document.getElementById('stat-net-icon-wrap');
      netEl.textContent = this.formatCurrency(data.netBalance);

      if (data.netBalance > 0) {
        netEl.className = 'text-2xl font-black text-emerald-600 tracking-tight';
        netHint.textContent = 'Lucro líquido positivo no mês';
        netWrap.className = 'w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center';
      } else if (data.netBalance < 0) {
        netEl.className = 'text-2xl font-black text-rose-600 tracking-tight';
        netHint.textContent = 'Despesas maiores que comissões';
        netWrap.className = 'w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center';
      } else {
        netEl.className = 'text-2xl font-black text-slate-700 tracking-tight';
        netHint.textContent = 'Ponto de equilíbrio';
        netWrap.className = 'w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center';
      }

      // To Receive
      const toReceive = (data.pendingCommission || 0) + (data.overdueCommission || 0);
      document.getElementById('stat-to-receive').textContent = this.formatCurrency(toReceive);
      document.getElementById('stat-pending-val').textContent = this.formatCurrency(data.pendingCommission);
      document.getElementById('stat-overdue-val').textContent = this.formatCurrency(data.overdueCommission);

      // Pending badge in sidebar & mobile
      const totalPendingCount = (data.pendingCount || 0) + (data.overdueCount || 0);
      const bDesktop = document.getElementById('badge-sales-pending');
      const bMobile = document.getElementById('badge-sales-pending-m');
      if (totalPendingCount > 0) {
        bDesktop.textContent = totalPendingCount;
        bDesktop.classList.remove('hidden');
        bMobile.classList.remove('hidden');
      } else {
        bDesktop.classList.add('hidden');
        bMobile.classList.add('hidden');
      }

      // Render Attention Orders List
      this.renderAttentionOrders(data.attentionOrders);

      // Render 6-Month Comparative Trend Chart
      this.renderMonthlyTrendChart(data.monthlyTrend);

      lucide.createIcons();
    } catch (err) {
      console.error('Error loading overview:', err);
    }
  },

  renderAttentionOrders(orders) {
    const container = document.getElementById('attention-orders-list');
    if (!orders || orders.length === 0) {
      container.innerHTML = `
        <div class="py-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1">
          <i data-lucide="check-circle" class="w-6 h-6 text-emerald-500"></i>
          <span class="font-medium text-slate-600">Tudo em dia!</span>
          <span class="text-[11px]">Nenhum pedido pendente ou atrasado no momento.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(o => {
      const isOverdue = o.status === 'atrasado';
      const statusBadge = isOverdue
        ? `<span class="badge-status-atrasado px-2 py-0.5 rounded-full text-[11px] font-bold">🔴 Atrasado</span>`
        : `<span class="badge-status-pendente px-2 py-0.5 rounded-full text-[11px] font-bold">🟡 Pendente</span>`;

      return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 gap-2 transition-all">
          <div class="flex items-start sm:items-center gap-3">
            <div class="mt-0.5 sm:mt-0">${statusBadge}</div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-slate-900">${this.escapeHtml(o.client_name)}</span>
                ${o.supplier ? `<span class="text-[10px] text-slate-400 font-normal">(${this.escapeHtml(o.supplier)})</span>` : ''}
              </div>
              <p class="text-[11px] text-slate-500">${o.quantity}x ${this.escapeHtml(o.items_desc)} • Pedido em ${this.formatDateBR(o.order_date)}</p>
            </div>
          </div>
          <div class="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/50">
            <span class="text-xs font-black text-slate-900">${this.formatCurrency(o.commission_total)}</span>
            <button onclick="app.quickSetOrderStatus(${o.id}, 'pago')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded-lg shadow-xs transition-all flex items-center gap-1">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
              <span>Marcar Pago</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  renderMonthlyTrendChart(trendData) {
    const ctx = document.getElementById('chart-monthly-trend').getContext('2d');
    if (this.charts.monthlyTrend) {
      this.charts.monthlyTrend.destroy();
    }

    const labels = trendData.map(d => d.monthLabel);
    const commissions = trendData.map(d => d.commission);
    const expenses = trendData.map(d => d.expense);

    this.charts.monthlyTrend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Comissões Recebidas (R$)',
            data: commissions,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Gastos Pessoais (R$)',
            data: expenses,
            backgroundColor: '#f43f5e',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${app.formatCurrency(item.raw)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              font: { size: 10 },
              callback: (val) => `R$ ${val}`
            },
            grid: { color: '#f1f5f9' }
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  },

  // ================= VIEW 2: VENDAS / ASSESSORIAS =================
  async loadOrders() {
    try {
      let url = `/api/orders?month=${this.currentMonth}`;
      if (this.salesFilter.status && this.salesFilter.status !== 'todos') {
        url += `&status=${encodeURIComponent(this.salesFilter.status)}`;
      }
      if (this.salesFilter.search) {
        url += `&search=${encodeURIComponent(this.salesFilter.search)}`;
      }
      if (this.salesFilter.supplier) {
        url += `&supplier=${encodeURIComponent(this.salesFilter.supplier)}`;
      }

      this.orders = await this.apiGet(url);
      this.renderOrdersTable(this.orders);
      this.updateDatalists();
      lucide.createIcons();
    } catch (err) {
      console.error('Error loading orders:', err);
    }
  },

  async loadSalesDashboardMetrics() {
    try {
      const data = await this.apiGet(`/api/dashboard/sales?month=${this.currentMonth}`);

      // Calculate totals from orders in current month
      let paid = 0, pending = 0, overdue = 0, pieces = 0;
      if (data.statusBreakdown) {
        data.statusBreakdown.forEach(s => {
          if (s.status === 'pago') { paid += s.total; pieces += s.pieces; }
          if (s.status === 'pendente') { pending += s.total; }
          if (s.status === 'atrasado') { overdue += s.total; }
        });
      }

      document.getElementById('sales-stat-paid').textContent = this.formatCurrency(paid);
      document.getElementById('sales-stat-pending').textContent = this.formatCurrency(pending);
      document.getElementById('sales-stat-overdue').textContent = this.formatCurrency(overdue);
      document.getElementById('sales-stat-pieces').textContent = `${pieces} peças`;

      // Render Top Clients Ranking
      this.renderTopClients(data.topClients);

      // Render Item Types Chart
      this.renderItemTypesChart(data.itemsByType);
      lucide.createIcons();
    } catch (err) {
      console.error('Error loading sales metrics:', err);
    }
  },

  renderOrdersTable(orders) {
    const tbody = document.getElementById('orders-table-body');
    const emptyState = document.getElementById('orders-empty-state');

    if (!orders || orders.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = orders.map(o => {
      const typeIcons = {
        tenis: '👟 Tênis',
        roupa: '👕 Roupa',
        blusa: '🧥 Blusa',
        outro: '📦 Outro'
      };

      const statusMap = {
        pago: { label: 'Pago', class: 'badge-status-pago' },
        atrasado: { label: 'Atrasado', class: 'badge-status-atrasado' },
        pendente: { label: 'Pendente', class: 'badge-status-pendente' }
      };
      const st = statusMap[o.status] || statusMap['pendente'];
      const hasMultiItems = Array.isArray(o.items) && o.items.length > 1;

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <!-- Status Column with Quick Toggle Selector -->
          <td class="px-4 py-3 whitespace-nowrap">
            <select onchange="app.quickSetOrderStatus(${o.id}, this.value)"
              class="${st.class} text-[11px] font-bold py-1 px-2.5 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="pendente" ${o.status === 'pendente' ? 'selected' : ''}>🟡 Pendente</option>
              <option value="atrasado" ${o.status === 'atrasado' ? 'selected' : ''}>🔴 Atrasado</option>
              <option value="pago" ${o.status === 'pago' ? 'selected' : ''}>🟢 Pago</option>
            </select>
          </td>

          <!-- Client Name -->
          <td class="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
            ${this.escapeHtml(o.client_name)}
          </td>

          <!-- Item Description & Type Badge -->
          <td class="px-4 py-3">
            ${hasMultiItems ? `
              <div class="space-y-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md text-[10px] border border-indigo-100">
                    <i data-lucide="layers" class="w-3 h-3"></i>
                    ${o.items.length} itens diferentes
                  </span>
                </div>
                <div class="space-y-0.5 text-[11px] text-slate-700 font-medium">
                  ${o.items.map(it => `
                    <div class="flex items-center gap-1.5">
                      <span class="text-[10px]">${typeIcons[it.item_type] || it.item_type}</span>
                      <span><b>${it.quantity}x</b> ${this.escapeHtml(it.items_desc)}</span>
                      <span class="text-[10px] text-slate-400">(${this.formatCurrency(it.commission_total || (it.quantity * it.commission_unit))})</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="inline-block bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-md text-[10px]">
                  ${typeIcons[o.item_type] || o.item_type}
                </span>
                <span class="text-slate-700 font-medium">${this.escapeHtml(o.items_desc)}</span>
              </div>
            `}
            ${o.notes ? `<p class="text-[10px] text-slate-400 italic mt-1 truncate max-w-xs">Obs: ${this.escapeHtml(o.notes)}</p>` : ''}
          </td>

          <!-- Supplier -->
          <td class="px-4 py-3 text-slate-500 whitespace-nowrap">
            ${o.supplier ? this.escapeHtml(o.supplier) : '<span class="text-slate-300 italic">Não informado</span>'}
          </td>

          <!-- Quantity -->
          <td class="px-4 py-3 text-center whitespace-nowrap">
            <span class="inline-block px-2.5 py-1 bg-slate-100 text-slate-800 font-black rounded-lg text-xs">
              ${o.quantity}
            </span>
          </td>

          <!-- Commission Total -->
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <span class="font-black text-slate-900 text-sm">${this.formatCurrency(o.commission_total)}</span>
            <p class="text-[10px] text-slate-400 font-normal">
              ${hasMultiItems ? `Média: ${this.formatCurrency(o.commission_unit)}/peça` : `(${o.quantity}x ${this.formatCurrency(o.commission_unit)})`}
            </p>
          </td>

          <!-- Order Date & Payment Date -->
          <td class="px-4 py-3 text-slate-500 whitespace-nowrap">
            <span>${this.formatDateBR(o.order_date)}</span>
            ${o.payment_date ? `<p class="text-[10px] text-emerald-600 font-semibold">Pago em ${this.formatDateBR(o.payment_date)}</p>` : ''}
          </td>

          <!-- Action Buttons -->
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1">
              <button onclick="app.editOrder(${o.id})" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white" title="Editar Pedido">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="app.deleteOrder(${o.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white" title="Excluir Pedido">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderTopClients(topClients) {
    const container = document.getElementById('top-clients-list');
    if (!topClients || topClients.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">Nenhum cliente registrado neste mês.</div>`;
      return;
    }

    container.innerHTML = topClients.map((c, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const rankBadge = medals[i] || `<span class="text-xs font-bold text-slate-400">#${i + 1}</span>`;

      return `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-all">
          <div class="flex items-center gap-3">
            <div class="w-7 text-center font-bold text-sm">${rankBadge}</div>
            <div>
              <p class="font-bold text-xs text-slate-800">${this.escapeHtml(c.client_name)}</p>
              <p class="text-[10px] text-slate-400">${c.total_orders} pedidos • <b>${c.total_pieces}</b> peças compradas</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-black text-emerald-600">${this.formatCurrency(c.paid_commission)}</span>
            <p class="text-[9px] text-slate-400">em comissões pagas</p>
          </div>
        </div>
      `;
    }).join('');
  },

  renderItemTypesChart(itemsByType) {
    const ctx = document.getElementById('chart-item-types').getContext('2d');
    if (this.charts.itemTypes) {
      this.charts.itemTypes.destroy();
    }

    const typeLabels = {
      tenis: 'Tênis',
      roupa: 'Roupas',
      blusa: 'Blusas',
      outro: 'Outros'
    };
    const typeColors = {
      tenis: '#6366f1', // Indigo
      roupa: '#10b981', // Emerald
      blusa: '#f59e0b', // Amber
      outro: '#8b5cf6'  // Purple
    };

    const labels = (itemsByType || []).map(item => typeLabels[item.item_type] || item.item_type);
    const data = (itemsByType || []).map(item => item.pieces_count);
    const bgColors = (itemsByType || []).map(item => typeColors[item.item_type] || '#cbd5e1');

    if (data.length === 0) {
      this.charts.itemTypes = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Sem dados'],
          datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
      return;
    }

    this.charts.itemTypes = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: ${item.raw} peças`
            }
          }
        }
      }
    });
  },

  setSalesStatusFilter(status) {
    this.salesFilter.status = status;
    document.querySelectorAll('.status-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-status-btn') === status) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.loadOrders();
  },

  debounceFilterOrders() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.salesFilter.search = document.getElementById('sales-filter-search').value.trim();
      this.salesFilter.supplier = document.getElementById('sales-filter-supplier').value.trim();
      this.loadOrders();
    }, 300);
  },

  clearSalesFilters() {
    document.getElementById('sales-filter-search').value = '';
    document.getElementById('sales-filter-supplier').value = '';
    this.salesFilter.search = '';
    this.salesFilter.supplier = '';
    this.setSalesStatusFilter('todos');
  },

  async quickSetOrderStatus(orderId, newStatus) {
    try {
      await this.apiPatch(`/api/orders/${orderId}/status`, { status: newStatus });
      this.showToast(`Status atualizado para ${newStatus.toUpperCase()}`, 'success');
      this.refreshCurrentView();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  updateDatalists() {
    const clients = [...new Set(this.orders.map(o => o.client_name).filter(Boolean))];
    const suppliers = [...new Set(this.orders.map(o => o.supplier).filter(Boolean))];

    const cList = document.getElementById('clients-datalist');
    const sList = document.getElementById('suppliers-datalist');

    if (cList) cList.innerHTML = clients.map(c => `<option value="${this.escapeHtml(c)}">`).join('');
    if (sList) sList.innerHTML = suppliers.map(s => `<option value="${this.escapeHtml(s)}">`).join('');
  },

  // --- ORDER MODAL (CREATE / EDIT MULTI-ITEMS) ---
  openOrderModal(orderData = null) {
    const modal = document.getElementById('modal-order');
    const form = document.getElementById('order-form');
    form.reset();

    const titleEl = document.getElementById('modal-order-title');
    const idEl = document.getElementById('order-id');
    const clientEl = document.getElementById('order-client');
    const supplierEl = document.getElementById('order-supplier');
    const dateEl = document.getElementById('order-date');
    const pDateEl = document.getElementById('order-payment-date');
    const notesEl = document.getElementById('order-notes');

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultComm = parseFloat(this.settings.default_commission || '10.00');

    if (orderData) {
      titleEl.textContent = 'Editar Pedido / Assessoria';
      idEl.value = orderData.id;
      clientEl.value = orderData.client_name || '';
      supplierEl.value = orderData.supplier || '';
      dateEl.value = orderData.order_date || todayStr;
      pDateEl.value = orderData.payment_date || '';
      notesEl.value = orderData.notes || '';
      this.setOrderStatusRadio(orderData.status || 'pendente');

      if (Array.isArray(orderData.items) && orderData.items.length > 0) {
        this.orderItems = orderData.items.map(it => ({
          item_type: it.item_type || 'tenis',
          items_desc: it.items_desc || '',
          quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
          commission_unit: it.commission_unit !== undefined ? parseFloat(it.commission_unit) : defaultComm
        }));
      } else {
        this.orderItems = [{
          item_type: orderData.item_type || 'tenis',
          items_desc: orderData.items_desc || '',
          quantity: Math.max(1, parseInt(orderData.quantity, 10) || 1),
          commission_unit: orderData.commission_unit !== undefined ? parseFloat(orderData.commission_unit) : defaultComm
        }];
      }
    } else {
      titleEl.textContent = 'Novo Pedido / Assessoria';
      idEl.value = '';
      clientEl.value = '';
      supplierEl.value = '';
      dateEl.value = todayStr;
      pDateEl.value = '';
      notesEl.value = '';
      this.setOrderStatusRadio('pendente');

      this.orderItems = [{
        item_type: 'tenis',
        items_desc: '',
        quantity: 1,
        commission_unit: defaultComm
      }];
    }

    this.renderOrderItems();
    modal.classList.remove('hidden');
    clientEl.focus();
    lucide.createIcons();
  },

  setOrderStatusRadio(status) {
    const radios = document.getElementsByName('order-status');
    for (const r of radios) {
      r.checked = (r.value === status);
    }
    this.onOrderStatusRadioChange(status);
  },

  onOrderStatusRadioChange(status) {
    const pDateWrap = document.getElementById('order-payment-date-wrap');
    const pDateInput = document.getElementById('order-payment-date');
    if (status === 'pago' && !pDateInput.value) {
      pDateInput.value = new Date().toISOString().split('T')[0];
    }
  },

  syncOrderItemsFromDOM() {
    const container = document.getElementById('order-items-container');
    if (!container) return;
    const cards = container.querySelectorAll('.order-item-card');
    const updated = [];

    cards.forEach(card => {
      const typeEl = card.querySelector('.order-item-type');
      const descEl = card.querySelector('.order-item-desc');
      const qtyEl = card.querySelector('.order-item-qty');
      const unitEl = card.querySelector('.order-item-unit');

      if (typeEl && descEl && qtyEl && unitEl) {
        updated.push({
          item_type: typeEl.value,
          items_desc: descEl.value,
          quantity: Math.max(1, parseInt(qtyEl.value, 10) || 1),
          commission_unit: Math.max(0, parseFloat(unitEl.value) || 0)
        });
      }
    });

    if (updated.length > 0) {
      this.orderItems = updated;
    }
  },

  addOrderItemRow() {
    this.syncOrderItemsFromDOM();
    const defaultComm = parseFloat(this.settings.default_commission || '10.00');
    this.orderItems.push({
      item_type: 'tenis',
      items_desc: '',
      quantity: 1,
      commission_unit: defaultComm
    });
    this.renderOrderItems();

    setTimeout(() => {
      const descs = document.querySelectorAll('.order-item-desc');
      if (descs.length > 0) {
        descs[descs.length - 1].focus();
      }
    }, 50);
  },

  removeOrderItemRow(index) {
    this.syncOrderItemsFromDOM();
    if (this.orderItems.length <= 1) {
      this.showToast('O pedido deve conter pelo menos 1 peça.', 'info');
      return;
    }
    this.orderItems.splice(index, 1);
    this.renderOrderItems();
  },

  renderOrderItems() {
    const container = document.getElementById('order-items-container');
    if (!container) return;

    container.innerHTML = this.orderItems.map((item, idx) => {
      const subtotal = (item.quantity || 1) * (item.commission_unit || 0);
      const isOnlyOne = this.orderItems.length === 1;

      return `
        <div class="order-item-card p-3.5 bg-slate-50/90 hover:bg-slate-50 border border-slate-200 rounded-2xl space-y-3 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span class="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 inline-flex items-center justify-center text-[10px] font-black">${idx + 1}</span>
              Peça #${idx + 1}
            </span>
            ${!isOnlyOne ? `
              <button type="button" onclick="app.removeOrderItemRow(${idx})" class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1 text-[11px] font-medium" title="Remover esta peça">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span class="text-[10px]">Remover</span>
              </button>
            ` : ''}
          </div>

          <!-- Tipo & Descrição -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label class="block text-[10px] font-semibold text-slate-600 mb-1">Tipo de Peça *</label>
              <select class="order-item-type w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500">
                <option value="tenis" ${item.item_type === 'tenis' ? 'selected' : ''}>👟 Tênis</option>
                <option value="roupa" ${item.item_type === 'roupa' ? 'selected' : ''}>👕 Roupa</option>
                <option value="blusa" ${item.item_type === 'blusa' ? 'selected' : ''}>🧥 Blusa</option>
                <option value="outro" ${item.item_type === 'outro' ? 'selected' : ''}>📦 Outro</option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="block text-[10px] font-semibold text-slate-600 mb-1">Descrição / Modelo / Tamanho *</label>
              <input type="text" class="order-item-desc w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                placeholder="Ex: Nike Air Force Branco tam 41" value="${this.escapeHtml(item.items_desc)}" required>
            </div>
          </div>

          <!-- Qtd + Comissão / Peça + Subtotal -->
          <div class="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60 items-center bg-white/70 p-2.5 rounded-xl border border-slate-100">
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Qtd Peças</label>
              <input type="number" min="1" value="${item.quantity || 1}" class="order-item-qty w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center text-slate-800 focus:ring-2 focus:ring-indigo-500"
                oninput="app.recalcOrderTotal()" required>
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Comissão / Peça</label>
              <div class="relative">
                <span class="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[10px] font-bold text-slate-400">R$</span>
                <input type="number" step="0.50" min="0" value="${item.commission_unit !== undefined ? item.commission_unit : 10}" class="order-item-unit w-full pl-7 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  oninput="app.recalcOrderTotal()" required>
              </div>
            </div>
            <div class="text-right">
              <span class="block text-[10px] font-semibold text-slate-400">Subtotal</span>
              <span class="order-item-subtotal text-xs font-black text-indigo-700">${this.formatCurrency(subtotal)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.recalcOrderTotal();
    lucide.createIcons();
  },

  recalcOrderTotal() {
    const container = document.getElementById('order-items-container');
    if (!container) return;

    const cards = container.querySelectorAll('.order-item-card');
    let totalPieces = 0;
    let totalCommission = 0;

    cards.forEach(card => {
      const qtyInput = card.querySelector('.order-item-qty');
      const unitInput = card.querySelector('.order-item-unit');
      const subtotalEl = card.querySelector('.order-item-subtotal');

      const qty = Math.max(1, parseInt(qtyInput ? qtyInput.value : 1, 10) || 1);
      const unit = Math.max(0, parseFloat(unitInput ? unitInput.value : 0) || 0);
      const subtotal = qty * unit;

      if (subtotalEl) {
        subtotalEl.textContent = this.formatCurrency(subtotal);
      }

      totalPieces += qty;
      totalCommission += subtotal;
    });

    const piecesEl = document.getElementById('order-summary-pieces');
    const itemsCountEl = document.getElementById('order-summary-items-count');
    const previewEl = document.getElementById('order-commission-total-preview');

    if (piecesEl) piecesEl.textContent = totalPieces;
    if (itemsCountEl) itemsCountEl.textContent = cards.length;
    if (previewEl) previewEl.textContent = this.formatCurrency(totalCommission);
  },

  async saveOrder(e) {
    e.preventDefault();
    this.syncOrderItemsFromDOM();

    const id = document.getElementById('order-id').value;
    const client_name = document.getElementById('order-client').value.trim();
    const supplier = document.getElementById('order-supplier').value.trim();
    const order_date = document.getElementById('order-date').value;
    const payment_date = document.getElementById('order-payment-date').value || null;
    const notes = document.getElementById('order-notes').value.trim();

    let status = 'pendente';
    const radios = document.getElementsByName('order-status');
    for (const r of radios) {
      if (r.checked) status = r.value;
    }

    if (!client_name) {
      this.showToast('Informe o nome do cliente.', 'error');
      return;
    }

    const validItems = (this.orderItems || []).filter(it => it.items_desc && it.items_desc.trim().length > 0);
    if (validItems.length === 0) {
      this.showToast('Informe a descrição de pelo menos uma peça.', 'error');
      return;
    }

    const payload = {
      client_name,
      supplier,
      items: validItems,
      order_date,
      payment_date: status === 'pago' ? (payment_date || order_date) : null,
      status,
      notes
    };

    try {
      if (id) {
        await this.apiPut(`/api/orders/${id}`, payload);
        this.showToast('Pedido atualizado com sucesso!', 'success');
      } else {
        await this.apiPost('/api/orders', payload);
        this.showToast('Pedido registrado com sucesso!', 'success');
      }
      this.closeModal('modal-order');
      this.refreshCurrentView();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async editOrder(id) {
    try {
      const order = await this.apiGet(`/api/orders/${id}`);
      this.openOrderModal(order);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async deleteOrder(id) {
    if (!confirm('Deseja realmente excluir este pedido? Esta ação não pode ser desfeita.')) return;
    try {
      await this.apiDelete(`/api/orders/${id}`);
      this.showToast('Pedido excluído!', 'success');
      this.refreshCurrentView();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ================= VIEW 3: FINANCEIRO PESSOAL =================
  async loadExpenses() {
    try {
      let url = `/api/expenses?month=${this.currentMonth}`;
      if (this.expensesFilter.categoryId && this.expensesFilter.categoryId !== 'todas') {
        url += `&categoryId=${encodeURIComponent(this.expensesFilter.categoryId)}`;
      }
      if (this.expensesFilter.search) {
        url += `&search=${encodeURIComponent(this.expensesFilter.search)}`;
      }

      this.expenses = await this.apiGet(url);
      this.renderExpensesTable(this.expenses);
      lucide.createIcons();
    } catch (err) {
      console.error('Error loading expenses:', err);
    }
  },

  async loadExpensesDashboardMetrics() {
    try {
      const data = await this.apiGet(`/api/dashboard/expenses?month=${this.currentMonth}`);
      const overview = await this.apiGet(`/api/dashboard/overview?month=${this.currentMonth}`);

      document.getElementById('expenses-stat-total').textContent = this.formatCurrency(overview.totalExpenses);
      document.getElementById('expenses-stat-net').textContent = this.formatCurrency(overview.netBalance);
      document.getElementById('expenses-stat-cats').textContent = (data.byCategory || []).length;

      this.renderExpensesCategoryChart(data.byCategory);
      lucide.createIcons();
    } catch (err) {
      console.error('Error loading expenses metrics:', err);
    }
  },

  renderExpensesTable(expenses) {
    const tbody = document.getElementById('expenses-table-body');
    const emptyState = document.getElementById('expenses-empty-state');
    const countBadge = document.getElementById('expenses-count-badge');

    countBadge.textContent = `${(expenses || []).length} lançamentos`;

    if (!expenses || expenses.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = expenses.map(e => {
      const catColor = e.category_color || '#6366f1';

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <td class="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">
            ${this.formatDateBR(e.expense_date)}
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-xs"
              style="background-color: ${catColor}">
              <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
              ${this.escapeHtml(e.category_name)}
            </span>
          </td>
          <td class="px-4 py-3 font-medium text-slate-800">
            ${this.escapeHtml(e.description)}
          </td>
          <td class="px-4 py-3 text-right font-black text-rose-600 whitespace-nowrap">
            - ${this.formatCurrency(e.amount)}
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1">
              <button onclick="app.editExpense(${e.id})" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white" title="Editar Gasto">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="app.deleteExpense(${e.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white" title="Excluir Gasto">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderExpensesCategoryChart(byCategory) {
    const ctx = document.getElementById('chart-expense-categories').getContext('2d');
    if (this.charts.expenseCategories) {
      this.charts.expenseCategories.destroy();
    }

    if (!byCategory || byCategory.length === 0) {
      this.charts.expenseCategories = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Sem gastos'],
          datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
      return;
    }

    const labels = byCategory.map(c => c.name);
    const data = byCategory.map(c => c.total);
    const bgColors = byCategory.map(c => c.color);

    this.charts.expenseCategories = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: ${app.formatCurrency(item.raw)}`
            }
          }
        }
      }
    });
  },

  renderCategoryFilters() {
    const container = document.getElementById('expenses-category-filters');
    if (!container) return;

    let html = `
      <button onclick="app.setExpenseCategoryFilter('todas')" class="px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-all ${this.expensesFilter.categoryId === 'todas' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        Todas
      </button>
    `;

    for (const cat of this.categories) {
      const active = this.expensesFilter.categoryId === String(cat.id);
      html += `
        <button onclick="app.setExpenseCategoryFilter('${cat.id}')" class="px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${active ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
          <span class="w-2 h-2 rounded-full" style="background-color: ${cat.color}"></span>
          <span>${this.escapeHtml(cat.name)}</span>
        </button>
      `;
    }
    container.innerHTML = html;
  },

  setExpenseCategoryFilter(catId) {
    this.expensesFilter.categoryId = catId;
    this.renderCategoryFilters();
    this.loadExpenses();
  },

  debounceFilterExpenses() {
    clearTimeout(this._expSearchTimer);
    this._expSearchTimer = setTimeout(() => {
      this.expensesFilter.search = document.getElementById('expenses-filter-search').value.trim();
      this.loadExpenses();
    }, 300);
  },

  // --- EXPENSE MODAL (CREATE / EDIT) ---
  openExpenseModal(expenseData = null) {
    const modal = document.getElementById('modal-expense');
    const form = document.getElementById('expense-form');
    form.reset();

    const titleEl = document.getElementById('modal-expense-title');
    const idEl = document.getElementById('expense-id');
    const catSelect = document.getElementById('expense-category-id');
    const descEl = document.getElementById('expense-desc');
    const amountEl = document.getElementById('expense-amount');
    const dateEl = document.getElementById('expense-date');

    const todayStr = new Date().toISOString().split('T')[0];

    if (expenseData) {
      titleEl.textContent = 'Editar Despesa Pessoal';
      idEl.value = expenseData.id;
      catSelect.value = expenseData.category_id;
      descEl.value = expenseData.description;
      amountEl.value = expenseData.amount;
      dateEl.value = expenseData.expense_date;
    } else {
      titleEl.textContent = 'Nova Despesa Pessoal';
      idEl.value = '';
      if (this.categories.length > 0) catSelect.value = this.categories[0].id;
      dateEl.value = todayStr;
    }

    modal.classList.remove('hidden');
    descEl.focus();
    lucide.createIcons();
  },

  async saveExpense(e) {
    e.preventDefault();
    const id = document.getElementById('expense-id').value;
    const category_id = parseInt(document.getElementById('expense-category-id').value, 10);
    const description = document.getElementById('expense-desc').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const expense_date = document.getElementById('expense-date').value;

    const payload = { category_id, description, amount, expense_date };

    try {
      if (id) {
        await this.apiPut(`/api/expenses/${id}`, payload);
        this.showToast('Despesa atualizada com sucesso!', 'success');
      } else {
        await this.apiPost('/api/expenses', payload);
        this.showToast('Despesa lançada com sucesso!', 'success');
      }
      this.closeModal('modal-expense');
      this.refreshCurrentView();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async editExpense(id) {
    try {
      const exp = await this.apiGet(`/api/expenses/${id}`);
      this.openExpenseModal(exp);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async deleteExpense(id) {
    if (!confirm('Deseja realmente excluir este lançamento de despesa?')) return;
    try {
      await this.apiDelete(`/api/expenses/${id}`);
      this.showToast('Despesa excluída!', 'success');
      this.refreshCurrentView();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ================= VIEW 4: CATEGORIAS & CONFIGURAÇÕES =================
  renderCategoryOptions() {
    const select = document.getElementById('expense-category-id');
    if (!select) return;
    select.innerHTML = this.categories.map(c => `
      <option value="${c.id}">${this.escapeHtml(c.name)}</option>
    `).join('');
  },

  renderCategoriesManagement() {
    const container = document.getElementById('categories-management-list');
    if (!container) return;

    container.innerHTML = this.categories.map(c => `
      <div class="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
        <div class="flex items-center gap-3">
          <span class="w-5 h-5 rounded-full shadow-xs border border-white" style="background-color: ${c.color}"></span>
          <div>
            <p class="font-bold text-xs text-slate-800">${this.escapeHtml(c.name)}</p>
            ${c.is_default ? '<span class="text-[9px] text-slate-400 font-medium">Categoria Padrão</span>' : ''}
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="app.editCategory(${c.id})" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white" title="Editar Categoria">
            <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="app.deleteCategory(${c.id})" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white" title="Excluir Categoria">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('');
    lucide.createIcons();
  },

  openCategoryModal(catData = null) {
    const modal = document.getElementById('modal-category');
    const form = document.getElementById('category-form');
    form.reset();

    const titleEl = document.getElementById('modal-cat-title');
    const idEl = document.getElementById('category-id');
    const nameEl = document.getElementById('category-name');
    const colorPicker = document.getElementById('category-color-picker');

    if (catData) {
      titleEl.textContent = 'Editar Categoria';
      idEl.value = catData.id;
      nameEl.value = catData.name;
      colorPicker.value = catData.color;
    } else {
      titleEl.textContent = 'Nova Categoria de Despesa';
      idEl.value = '';
      colorPicker.value = '#6366f1';
    }

    modal.classList.remove('hidden');
    nameEl.focus();
    lucide.createIcons();
  },

  selectCategoryColor(colorHex) {
    document.getElementById('category-color-picker').value = colorHex;
  },

  async saveCategory(e) {
    e.preventDefault();
    const id = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value.trim();
    const color = document.getElementById('category-color-picker').value;

    try {
      if (id) {
        await this.apiPut(`/api/categories/${id}`, { name, color });
        this.showToast('Categoria atualizada!', 'success');
      } else {
        await this.apiPost('/api/categories', { name, color });
        this.showToast('Categoria criada com sucesso!', 'success');
      }
      this.closeModal('modal-category');
      await this.loadCategories();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  editCategory(id) {
    const cat = this.categories.find(c => c.id === id);
    if (cat) this.openCategoryModal(cat);
  },

  async deleteCategory(id) {
    if (!confirm('Deseja excluir esta categoria?')) return;
    try {
      await this.apiDelete(`/api/categories/${id}`);
      this.showToast('Categoria excluída!', 'success');
      await this.loadCategories();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async saveCommissionSetting(e) {
    e.preventDefault();
    const rate = document.getElementById('setting-default-commission').value;
    try {
      await this.apiPost('/api/settings', { default_commission: rate });
      this.settings.default_commission = rate;
      const rateEl = document.getElementById('dashboard-commission-rate');
      if (rateEl) rateEl.textContent = `R$ ${parseFloat(rate).toFixed(2).replace('.', ',')}`;
      this.showToast('Taxa de comissão padrão atualizada!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('pw-current').value;
    const newPassword = document.getElementById('pw-new').value;

    try {
      await this.apiPost('/api/auth/change-password', { currentPassword, newPassword });
      this.showToast('Senha alterada com sucesso!', 'success');
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // --- EXPORTS ---
  exportBackup() {
    window.location.href = '/api/export/backup';
  },

  exportOrdersCSV() {
    window.location.href = '/api/export/orders.csv';
  },

  exportExpensesCSV() {
    window.location.href = '/api/export/expenses.csv';
  },

  // --- MODAL UTILS ---
  openQuickActionsModal() {
    document.getElementById('modal-quick-actions').classList.remove('hidden');
    lucide.createIcons();
  },

  closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  },

  // --- FORMATTERS & UTILITIES ---
  formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatDateBR(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    const typeClasses = {
      success: 'bg-emerald-600 text-white shadow-emerald-200',
      error: 'bg-rose-600 text-white shadow-rose-200',
      info: 'bg-slate-800 text-white shadow-slate-200'
    };

    toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold transform transition-all duration-300 pointer-events-auto ${typeClasses[type] || typeClasses.info}`;
    toast.innerHTML = `
      <span>${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
};

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
