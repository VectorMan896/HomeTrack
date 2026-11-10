/* ============================================================
   HomeTrack — i18n (English / Português pt-PT)
   Live translation layer: a dictionary + a DOM observer that
   translates UI chrome as it renders. Falls back to English for
   anything not in the dictionary, so it degrades gracefully.
   Switching language reloads the app for a clean state.
   ============================================================ */
(function (HT) {
  const DICT = {
    // nav / titles
    'Home': 'Início', 'Power': 'Energia', 'Water': 'Água', 'Budget': 'Orçamento', 'Settings': 'Definições', 'Studio': 'Estúdio', 'Overview': 'Resumo',
    'Prepaid electricity': 'Electricidade pré-paga', 'Metered water': 'Água por contador', 'Money & budgets': 'Dinheiro e orçamentos',
    // greetings / status
    'Good morning': 'Bom dia', 'Good afternoon': 'Boa tarde', 'Good evening': 'Boa noite', 'Everything looks healthy.': 'Está tudo bem.',
    'All good': 'Tudo bem', 'Action needed': 'Acção necessária', 'Heads up': 'Atenção', 'Get started': 'Começar',
    'Healthy': 'Saudável', 'Recharge now': 'Recarregar já', 'Recharge soon': 'Recarregar em breve', 'On track': 'No bom caminho',
    'Over budget': 'Acima do orçamento', 'Near limit': 'Perto do limite', 'Possible leak': 'Possível fuga', 'Above limit': 'Acima do limite',
    // hero labels
    'Estimated days remaining': 'Dias restantes estimados', 'Spent in budgets this cycle': 'Gasto em orçamentos neste ciclo',
    'Spent this cycle': 'Gasto neste ciclo', 'Used this cycle': 'Usado neste ciclo', 'Projected bill this cycle': 'Conta projectada deste ciclo',
    // stat labels
    'Avg use': 'Uso médio', 'Last period': 'Último período', 'Value left': 'Valor restante', 'Cost / day': 'Custo / dia', 'Rate': 'Tarifa',
    'Total spent': 'Total gasto', 'Balance': 'Saldo', 'Runway': 'Autonomia', 'Income': 'Rendimento', 'Spent': 'Gasto', 'Net': 'Líquido',
    'Avg/day': 'Média/dia', 'Avg / day': 'Média / dia', 'Income (cycle)': 'Rendimento (ciclo)', 'Spent (cycle)': 'Gasto (ciclo)',
    'Net (cycle)': 'Líquido (ciclo)', 'Used (cycle)': 'Usado (ciclo)', 'Projected': 'Projectado', 'Days left': 'Dias restantes',
    'Meter now': 'Contador agora', 'Bill so far': 'Conta até agora', 'days': 'dias', 'day': 'dia',
    // card headings
    'Remaining energy': 'Energia restante', 'Daily consumption': 'Consumo diário', 'History': 'Histórico', 'Appliances': 'Electrodomésticos',
    'Power settings': 'Definições de energia', 'Meter readings': 'Leituras do contador', 'Daily water use': 'Uso diário de água',
    'Water settings': 'Definições de água', 'Spending this cycle': 'Gastos deste ciclo', 'Where the money went': 'Para onde foi o dinheiro',
    'Categories': 'Categorias', 'Budget settings': 'Definições de orçamento', 'App settings': 'Definições da aplicação',
    'Backup & data': 'Cópia de segurança e dados', 'Full backup': 'Cópia completa', 'Per-module data': 'Dados por módulo',
    'Account & sync': 'Conta e sincronização', 'Automatic SMS capture': 'Captura automática de SMS', 'SMS capture': 'Captura de SMS',
    'ComfyUI gallery': 'Galeria ComfyUI', 'Chat': 'Conversa', 'Review SMS transactions': 'Rever transacções de SMS',
    'Add transaction': 'Adicionar transacção', 'Add appliance': 'Adicionar electrodoméstico', 'Edit appliance': 'Editar electrodoméstico',
    'Add category': 'Adicionar categoria', 'Edit transaction': 'Editar transacção', 'Edit category': 'Editar categoria', 'Log power': 'Registar energia', 'Log water': 'Registar água',
    'Account': 'Conta', 'Detect senders': 'Detectar remetentes', 'Spent in budgets': 'Gasto em orçamentos', 'Budgeted': 'Orçamentado',
    'Admin · Studio': 'Admin · Estúdio',
    'This month': 'Este mês', 'Monthly cost': 'Custo mensal', 'Power stats': 'Estatísticas de energia', 'Used so far': 'Usado até agora',
    'Projected month': 'Mês projectado', 'Avg / month': 'Média / mês', 'Projected / year': 'Projecção / ano', 'Avg recharge': 'Recarga média',
    'Recharge every': 'Recarga a cada', 'Peak day': 'Dia de pico', 'Price change': 'Variação de preço', 'last 6 months': 'últimos 6 meses',
    'Reliable alerts': 'Alertas fiáveis', 'Battery optimisation': 'Optimização da bateria', 'Exact alarms': 'Alarmes exactos',
    'Fix': 'Corrigir', 'Allowed': 'Permitido', 'Blocked': 'Bloqueado', 'Send a test notification': 'Enviar notificação de teste',
    'Open app settings (Autostart)': 'Abrir definições da app (Arranque automático)',
    // buttons
    'Save': 'Guardar', 'Delete': 'Eliminar', 'Add': 'Adicionar', 'Cancel': 'Cancelar', 'Export': 'Exportar', 'Import': 'Importar', 'Reset': 'Repor',
    'Save reading': 'Guardar leitura', 'Save recharge': 'Guardar recarga', 'Save expense': 'Guardar despesa', 'Save income': 'Guardar rendimento',
    'Save payment': 'Guardar pagamento', 'Save settings': 'Guardar definições', 'Sign in': 'Entrar', 'Sign out': 'Sair', 'Create account': 'Criar conta',
    'Scan messages now': 'Verificar mensagens agora', 'Scan approved senders now': 'Verificar remetentes aprovados',
    'Scan for new transactions': 'Procurar novas transacções', 'Detect senders from my inbox': 'Detectar remetentes da caixa de entrada',
    'Remove SMS-imported entries': 'Remover entradas importadas por SMS', 'Test bridge connection': 'Testar ligação à ponte',
    'Sync now': 'Sincronizar agora', 'Review': 'Rever', 'Approve all': 'Aprovar tudo', 'Dismiss all': 'Ignorar tudo',
    'Open PixelAnvil': 'Abrir PixelAnvil', 'Load more': 'Carregar mais', 'Refresh': 'Actualizar', 'Dismiss': 'Ignorar', 'Add sender': 'Adicionar remetente',
    'Forget SMS history (re-review all)': 'Esquecer histórico de SMS (rever tudo)',
    'Export everything (JSON)': 'Exportar tudo (JSON)', 'Import everything (JSON)': 'Importar tudo (JSON)', 'Reset ALL data': 'Repor TODOS os dados',
    // form labels / options
    'Language': 'Idioma', 'Theme': 'Tema', 'System (match device)': 'Sistema (do dispositivo)', 'Light': 'Claro', 'Dark': 'Escuro',
    'Currency label': 'Moeda', 'Amount': 'Montante', 'Category': 'Categoria', 'Note': 'Nota', 'Date & time': 'Data e hora',
    'Quantity': 'Quantidade', 'Name': 'Nome', 'Icon': 'Ícone', 'Colour': 'Cor', 'Days per week': 'Dias por semana', 'Reference': 'Referência',
    'Remaining kWh on meter': 'kWh restantes no contador', 'Meter reading (m³)': 'Leitura do contador (m³)', 'Bill payment': 'Pagamento de conta',
    'Amount paid': 'Montante pago', 'Approved senders': 'Remetentes aprovados', 'Show hidden features': 'Mostrar funcionalidades ocultas',
    'Meter reading': 'Leitura do contador', 'Recharge': 'Recarga', 'Expense': 'Despesa', 'Income ': 'Rendimento ', 'Payment': 'Pagamento',
    'Monthly budget': 'Orçamento mensal', 'Energy received (kWh)': 'Energia recebida (kWh)', 'Assumed kWh/day': 'kWh/dia assumido',
    'PC address (LAN or Tailscale IP)': 'Endereço do PC (IP LAN ou Tailscale)', 'Quick pick': 'Escolha rápida',
    'Cycle resets on day': 'Ciclo reinicia no dia', 'Billing day': 'Dia de facturação',
    // sub-tabs
    '🖼 Gallery': '🖼 Galeria', '💬 Chat': '💬 Conversa',
    // toasts
    'Reading saved': 'Leitura guardada', 'Recharge saved': 'Recarga guardada', 'Expense saved': 'Despesa guardada', 'Income saved': 'Rendimento guardado',
    'Payment saved': 'Pagamento guardado', 'Appliance saved': 'Electrodoméstico guardado', 'Category saved': 'Categoria guardada', 'Deleted': 'Eliminado',
    'Settings saved': 'Definições guardadas', 'All data reset': 'Todos os dados repostos', 'Data imported': 'Dados importados', 'Synced': 'Sincronizado',
    'Signed out': 'Sessão terminada', 'Exported': 'Exportado', 'Bridge OK ✓': 'Ponte OK ✓',
    // misc
    'no budget': 'sem orçamento', 'not set': 'não definido', 'never': 'nunca', 'income': 'rendimento', 'expense': 'despesa',
    'off': 'desligado', 'on': 'ligado'
  };

  const lang = () => (HT.state && HT.state.settings && HT.state.settings.lang) || 'en';

  function tr(str) {
    if (!str) return null;
    const key = str.trim();
    if (!key) return null;
    if (DICT[key]) return str.replace(key, DICT[key]);
    const m = key.match(/^([^\p{L}]+)(.+)$/u);            // strip a leading emoji/symbol run, e.g. "＋ Add"
    if (m && DICT[m[2]]) return str.replace(key, m[1] + DICT[m[2]]);
    return null;
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { const t = tr(root.nodeValue); if (t !== null) root.nodeValue = t; return; }
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const jobs = []; let n;
    while ((n = w.nextNode())) { const t = tr(n.nodeValue); if (t !== null && t !== n.nodeValue) jobs.push([n, t]); }
    jobs.forEach(([node, t]) => { node.nodeValue = t; });
    const self = root.matches && root.matches('[placeholder]') ? [root] : [];
    self.concat(Array.from(root.querySelectorAll ? root.querySelectorAll('[placeholder]') : [])).forEach(el => { const t = tr(el.getAttribute('placeholder')); if (t !== null) el.setAttribute('placeholder', t); });
  }

  let obs = null;
  function start() {
    translateTree(document.body);
    obs = new MutationObserver((muts) => {
      obs.disconnect();
      muts.forEach(m => {
        if (m.type === 'characterData') { const t = tr(m.target.nodeValue); if (t !== null) m.target.nodeValue = t; }
        else if (m.addedNodes) m.addedNodes.forEach(nd => translateTree(nd));
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  HT.i18n = { tr, translateTree, DICT, lang };
  if (lang() === 'pt') { if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); }
})(window.HT);
