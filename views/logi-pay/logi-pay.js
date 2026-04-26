const LogiPayView = {
    requests: [],
    currentFilter: 'all',
    _searchDebounce: null,

    _container() { return document.getElementById('main-content'); },
    _isStillMounted() { return !!this._container(); },

    async render() {
        const content = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Logi Pay</h1>
                    <p class="page-subtitle">Paiements fournisseurs</p>
                </div>
            </div>

            <!-- Stats Cards -->
            <div class="logi-pay-stats" id="lp-stats">
                <div class="lp-stat-card pending">
                    <span class="lp-stat-label">En attente</span>
                    <span class="lp-stat-value" id="lp-stat-pending">—</span>
                    <span class="lp-stat-sub">Paiement client requis</span>
                </div>
                <div class="lp-stat-card received">
                    <span class="lp-stat-label">Payé / En cours</span>
                    <span class="lp-stat-value" id="lp-stat-processing">—</span>
                    <span class="lp-stat-sub">À traiter</span>
                </div>
                <div class="lp-stat-card completed">
                    <span class="lp-stat-label">Terminées</span>
                    <span class="lp-stat-value" id="lp-stat-completed">—</span>
                    <span class="lp-stat-sub">Ce mois</span>
                </div>
                <div class="lp-stat-card rejected">
                    <span class="lp-stat-label">Total CNY</span>
                    <span class="lp-stat-value" id="lp-stat-total-cny">—</span>
                    <span class="lp-stat-sub">En attente de paiement</span>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center" style="gap: 12px; flex-wrap: wrap;">
                        <h2 class="card-title">Demandes de paiement</h2>
                        <div class="lp-filter-bar">
                            <select class="form-input" id="logi-pay-status-filter" style="width: auto; min-width: 180px;">
                                <option value="all">Tous les statuts</option>
                                <option value="pending_payment">En attente de paiement</option>
                                <option value="paid_by_client">Payé par le client</option>
                                <option value="processing">En traitement</option>
                                <option value="completed">Terminé</option>
                                <option value="rejected">Rejeté</option>
                            </select>
                            <input type="text" class="form-input" id="logi-pay-search" placeholder="Rechercher client, fournisseur..." style="min-width: 220px; flex: 1;">
                            <button class="btn btn-ghost btn-sm" id="btn-lp-refresh" title="Actualiser">
                                ${Icons.get('refresh-cw', {size: 16})}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="table-container">
                    <table class="table" id="logi-pay-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Client</th>
                                <th>Fournisseur</th>
                                <th>Montant (CNY)</th>
                                <th>Montant local</th>
                                <th>Méthode</th>
                                <th>Statut</th>
                                <th class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="logi-pay-list">
                            <tr><td colspan="8" class="text-center py-4">
                                <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text-muted)">
                                    ${Icons.get('loader', {size: 18})} Chargement...
                                </div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const main = document.getElementById('main-content');
        if (!main) {
            console.error('[LogiPay Admin] main-content introuvable');
            return;
        }
        main.innerHTML = content;
        await this.loadData();
        this.bindEvents();
    },

    async loadData() {
        try {
            const params = {};
            if (this.currentFilter !== 'all') params.status = this.currentFilter;

            const searchInput = document.getElementById('logi-pay-search');
            if (searchInput && searchInput.value.trim()) {
                params.search = searchInput.value.trim();
            }

            const response = await API.logiPay.admin.getRequests(params);
            
            // Guard: si l'utilisateur a changé de vue pendant la requête
            if (!this._isStillMounted()) return;

            this.requests = response.requests || [];
            this.renderTable();
            this.updateStats();
        } catch (error) {
            console.error('Error loading Logi Pay requests:', error);
            if (this._isStillMounted()) {
                Toast.error('Erreur lors du chargement des demandes');
            }
        }
    },

    updateStats() {
        const all = this.requests;

        // Pending = en attente de paiement client
        const pending = all.filter(r => r.status === 'pending_payment').length;
        // Processing = payé par client + en cours
        const processing = all.filter(r => ['paid_by_client', 'processing'].includes(r.status)).length;
        // Completed = terminé
        const completed = all.filter(r => r.status === 'completed').length;
        // Total CNY pending
        const totalCnyPending = all
            .filter(r => r.status === 'pending_payment')
            .reduce((sum, r) => sum + (parseFloat(r.amount_cny) || 0), 0);

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setEl('lp-stat-pending', pending);
        setEl('lp-stat-processing', processing);
        setEl('lp-stat-completed', completed);
        setEl('lp-stat-total-cny', totalCnyPending > 0 ? `¥${Math.round(totalCnyPending).toLocaleString()}` : '¥0');
    },

    getStatusBadge(status) {
        const map = {
            'pending_payment': '<span class="badge badge-warning"><span class="lp-dot pending"></span>En attente paiement</span>',
            'paid_by_client':  '<span class="badge badge-info"><span class="lp-dot received"></span>Payé par client</span>',
            'processing':      '<span class="badge badge-primary"><span class="lp-dot processing"></span>En traitement</span>',
            'completed':       '<span class="badge badge-success"><span class="lp-dot completed"></span>Terminé</span>',
            'rejected':        '<span class="badge badge-danger"><span class="lp-dot rejected"></span>Rejeté</span>'
        };
        return map[status] || `<span class="badge badge-secondary">${status}</span>`;
    },

    formatCurrency(amount, currency) {
        if (typeof amount !== 'number' && typeof amount !== 'string') return '—';
        const num = parseFloat(amount);
        if (isNaN(num)) return '—';
        return `${num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency || ''}`;
    },

    renderTable() {
        const tbody = document.getElementById('logi-pay-list');
        if (!tbody) return;

        if (this.requests.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="8">
                    <div class="lp-admin-empty">
                        ${Icons.get('inbox', {size: 48})}
                        <p style="font-weight:600;margin:8px 0 4px;">Aucune demande trouvée</p>
                        <p style="color:var(--text-muted);font-size:13px;">Les demandes de paiement fournisseur soumises par les clients apparaîtront ici.</p>
                    </div>
                </td></tr>`;
            return;
        }

        tbody.innerHTML = this.requests.map(req => {
            const date = new Date(req.created_at).toLocaleDateString('fr-FR');
            const clientData = req.Client || req.client;
            const clientName = clientData ? (clientData.name || `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim() || clientData.email) : 'Client inconnu';
            const clientPhone = clientData?.phone || '';
            const amountCny = parseFloat(req.amount_cny) || 0;

            return `
                <tr>
                    <td style="white-space:nowrap;">${date}</td>
                    <td>
                        <div class="font-medium">${clientName}</div>
                        ${clientPhone ? `<div class="text-xs text-muted">${clientPhone}</div>` : ''}
                    </td>
                    <td>
                        <div class="font-medium">${req.supplier_name}</div>
                        ${req.order_reference ? `<div class="text-xs text-muted">Réf: ${req.order_reference}</div>` : ''}
                    </td>
                    <td class="font-medium" style="color:var(--primary);">¥${amountCny.toLocaleString('fr-FR')}</td>
                    <td class="font-medium">${this.formatCurrency(req.amount_local, req.currency_local)}</td>
                    <td>
                        <div style="font-size:13px;">${req.payment_method}</div>
                        <div class="text-xs text-muted">${req.beneficiary_account || ''}</div>
                    </td>
                    <td>${this.getStatusBadge(req.status)}</td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-outline btn-action" data-action="view" data-id="${req.id}" title="Gérer cette demande">
                            ${Icons.get('edit', {size: 14})} Gérer
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    bindEvents() {
        document.getElementById('logi-pay-status-filter')?.addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.loadData();
        });

        document.getElementById('logi-pay-search')?.addEventListener('input', () => {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => this.loadData(), 450);
        });

        document.getElementById('btn-lp-refresh')?.addEventListener('click', () => this.loadData());

        document.getElementById('logi-pay-list')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-action');
            if (!btn) return;
            if (btn.dataset.action === 'view') this.showManageModal(btn.dataset.id);
        });
    },

    showManageModal(id) {
        const req = this.requests.find(r => r.id === id);
        if (!req) return;

        const clientData = req.Client || req.client;
        const clientName = clientData ? (clientData.name || `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim() || clientData.email) : 'Inconnu';
        const amountCny = parseFloat(req.amount_cny) || 0;

        const content = `
            <div class="lp-detail-grid">
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Client</div>
                    <div class="lp-detail-value">${clientName}</div>
                </div>
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Fournisseur</div>
                    <div class="lp-detail-value">${req.supplier_name}</div>
                </div>
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Montant (Yuan)</div>
                    <div class="lp-detail-value" style="color:var(--primary);">¥${amountCny.toLocaleString('fr-FR')}</div>
                </div>
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Total à payer (Local)</div>
                    <div class="lp-detail-value">${this.formatCurrency(req.amount_local, req.currency_local)}</div>
                </div>
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Méthode de paiement</div>
                    <div class="lp-detail-value">${req.payment_method}</div>
                </div>
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Compte bénéficiaire</div>
                    <div class="lp-detail-value">${req.beneficiary_account}</div>
                </div>
                ${req.beneficiary_name ? `
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Nom bénéficiaire</div>
                    <div class="lp-detail-value">${req.beneficiary_name}</div>
                </div>` : ''}
                ${req.order_reference ? `
                <div class="lp-detail-item">
                    <div class="lp-detail-label">Référence commande</div>
                    <div class="lp-detail-value">${req.order_reference}</div>
                </div>` : ''}
            </div>

            ${req.screenshot_url ? `
            <div class="form-group">
                <label class="form-label">Capture d'écran du client</label>
                <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; text-align: center;">
                    <img src="${req.screenshot_url}" style="max-width: 100%; max-height: 220px; border-radius: 6px;" alt="Capture">
                </div>
            </div>` : ''}

            ${req.client_notes ? `
            <div class="form-group">
                <label class="form-label">Notes du client</label>
                <div style="background:var(--bg-color-alt);border-radius:8px;padding:10px 14px;font-size:13px;">${req.client_notes}</div>
            </div>` : ''}

            <div class="form-group mt-4">
                <label class="form-label">Statut du traitement *</label>
                <select class="form-input" id="modal-status">
                    <option value="pending_payment" ${req.status === 'pending_payment' ? 'selected' : ''}>En attente de paiement (Client)</option>
                    <option value="paid_by_client"  ${req.status === 'paid_by_client'  ? 'selected' : ''}>Payé par le client</option>
                    <option value="processing"      ${req.status === 'processing'      ? 'selected' : ''}>En cours de traitement</option>
                    <option value="completed"       ${req.status === 'completed'       ? 'selected' : ''}>Terminé (Paiement fournisseur effectué)</option>
                    <option value="rejected"        ${req.status === 'rejected'        ? 'selected' : ''}>Rejeté / Annulé</option>
                </select>
            </div>

            <div class="form-group" id="reject-reason-group" style="${req.status === 'rejected' ? 'display:block;' : 'display:none;'}">
                <label class="form-label">Motif du rejet</label>
                <textarea class="form-input" id="modal-reject-reason" rows="2" placeholder="Expliquez pourquoi la demande est rejetée...">${req.rejection_reason || ''}</textarea>
            </div>

            <div class="form-group">
                <label class="form-label">Notes internes (Admin uniquement)</label>
                <textarea class="form-input" id="modal-admin-notes" rows="2" placeholder="Notes internes...">${req.admin_notes || ''}</textarea>
            </div>
        `;

        Modal.form({
            title: `Demande Logi Pay — ${req.supplier_name}`,
            content,
            size: 'md',
            confirmText: 'Mettre à jour le statut',
            onOpen: () => {
                const statusSelect = document.getElementById('modal-status');
                const rejectGroup = document.getElementById('reject-reason-group');

                statusSelect?.addEventListener('change', (e) => {
                    rejectGroup.style.display = e.target.value === 'rejected' ? 'block' : 'none';
                });
            }
        }).then(async (confirmed) => {
            if (!confirmed) return;

            const newStatus = document.getElementById('modal-status')?.value;
            const adminNotes = document.getElementById('modal-admin-notes')?.value.trim();
            const rejectReason = document.getElementById('modal-reject-reason')?.value.trim();

            try {
                const payload = { status: newStatus, admin_notes: adminNotes };
                if (newStatus === 'rejected') payload.rejection_reason = rejectReason;

                await API.logiPay.admin.updateStatus(id, payload);
                Toast.success('Statut mis à jour avec succès');
                await this.loadData();
            } catch (error) {
                console.error('Error updating Logi Pay status:', error);
                Toast.error(error.message || 'Erreur lors de la mise à jour');
            }
        });
    }
};

window.LogiPayView = LogiPayView;
