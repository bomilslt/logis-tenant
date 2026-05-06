/**
 * Vue Groupages (admin)
 * Liste les demandes de groupage de colis et permet de les approuver/rejeter/consolider.
 *
 * La vue affiche:
 *  - Une table avec filtres (statut, recherche par n° groupe ou tracking colis)
 *  - Au clic sur un groupage, un panneau de détail s'ouvre avec :
 *      * Infos client + statut + dates
 *      * Liste des colis du groupe avec PHOTOS (clé pour la consolidation physique)
 *      * Actions: approuver / rejeter / consolider (assigner départ)
 */

Views.groups = {
    filters: { status: '', search: '' },
    groups: [],
    selectedGroup: null,
    departures: [],

    async render() {
        const main = document.getElementById('main-content');

        main.innerHTML = `
            <div class="groups-page">
                <div class="page-header">
                    <h1 class="page-title">Groupages de colis</h1>
                    <button class="btn btn-ghost btn-sm" id="btn-refresh-groups" title="Actualiser">
                        ${Icons.get('refresh', {size:16})}
                    </button>
                </div>

                <!-- Filtres -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="groups-filters-grid">
                            <div class="form-group">
                                <label class="form-label">Recherche</label>
                                <input type="text" id="grp-filter-search" class="form-input"
                                       placeholder="N° groupage ou tracking colis..." value="${this.filters.search}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Statut</label>
                                <select id="grp-filter-status" class="form-input">
                                    <option value="">Tous</option>
                                    <option value="pending_approval" ${this.filters.status === 'pending_approval' ? 'selected' : ''}>En attente d'approbation</option>
                                    <option value="approved" ${this.filters.status === 'approved' ? 'selected' : ''}>Approuvé</option>
                                    <option value="ready_consolidation" ${this.filters.status === 'ready_consolidation' ? 'selected' : ''}>Prêt à consolider</option>
                                    <option value="consolidated" ${this.filters.status === 'consolidated' ? 'selected' : ''}>Consolidé</option>
                                    <option value="rejected" ${this.filters.status === 'rejected' ? 'selected' : ''}>Rejeté</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Layout liste + détail -->
                <div class="groups-layout">
                    <!-- Liste -->
                    <div class="card groups-list-card">
                        <div class="card-body" id="groups-list">
                            ${Loader.page('Chargement...')}
                        </div>
                    </div>

                    <!-- Détail -->
                    <div class="card groups-detail-card" id="groups-detail">
                        <div class="card-body">
                            <div class="empty-state">
                                ${Icons.get('package', {size:48})}
                                <h3 class="empty-state-title">Sélectionnez un groupage</h3>
                                <p class="empty-state-text">Choisissez un groupage dans la liste pour voir les détails et les colis associés.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await this.loadGroups();
        this.attachEvents();
    },

    async loadGroups() {
        try {
            const data = await API.groups.getAll({
                status: this.filters.status,
                search: this.filters.search
            });
            this.groups = data.groups || [];
            this.renderList();
        } catch (e) {
            console.error('[groups] load error', e);
            const list = document.getElementById('groups-list');
            if (list) list.innerHTML = `<div class="error-state">${Icons.get('alert-circle',{size:32})}<p>${e.message || 'Erreur de chargement'}</p></div>`;
        }
    },

    renderList() {
        const list = document.getElementById('groups-list');
        if (!list) return;

        if (!this.groups.length) {
            list.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('package', {size:40})}
                    <h3 class="empty-state-title">Aucun groupage</h3>
                    <p class="empty-state-text">Aucune demande ne correspond à vos filtres.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.groups.map(g => this.renderGroupRow(g)).join('');

        list.querySelectorAll('.group-row').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.id;
                this.openDetail(id);
                list.querySelectorAll('.group-row').forEach(r => r.classList.remove('active'));
                row.classList.add('active');
            });
        });
    },

    renderGroupRow(g) {
        const date = g.created_at ? new Date(g.created_at).toLocaleDateString('fr-FR') : '-';
        const clientName = g.client?.name || '—';
        const isSelected = this.selectedGroup?.id === g.id;
        return `
            <div class="group-row ${isSelected ? 'active' : ''}" data-id="${g.id}">
                <div class="group-row-main">
                    <div class="group-row-number">${g.group_number}</div>
                    <div class="group-row-client">${clientName}</div>
                    <div class="group-row-meta">
                        <span>${g.package_count} colis</span>
                        <span class="dot">·</span>
                        <span>${date}</span>
                    </div>
                </div>
                <div class="group-row-side">
                    ${this.renderStatusBadge(g.status)}
                    ${(g.status === 'approved' || g.status === 'ready_consolidation') ? `
                        <div class="group-row-progress">${g.received_count}/${g.package_count} reçus</div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderStatusBadge(status) {
        const map = {
            'pending_approval':    { label: 'En attente', cls: 'grp-badge-warning', icon: 'clock' },
            'approved':            { label: 'Approuvé',   cls: 'grp-badge-info',    icon: 'check' },
            'ready_consolidation': { label: 'À consolider', cls: 'grp-badge-primary', icon: 'package' },
            'consolidated':        { label: 'Consolidé',  cls: 'grp-badge-success', icon: 'check-circle' },
            'rejected':            { label: 'Rejeté',     cls: 'grp-badge-error',   icon: 'x-circle' }
        };
        const m = map[status] || { label: status, cls: 'grp-badge-default', icon: 'tag' };
        return `<span class="grp-badge ${m.cls}">${Icons.get(m.icon,{size:12})}${m.label}</span>`;
    },

    async openDetail(groupId) {
        const detail = document.getElementById('groups-detail');
        detail.innerHTML = `<div class="card-body">${Loader.page('Chargement...')}</div>`;

        try {
            const data = await API.groups.getById(groupId);
            this.selectedGroup = data.group;
            this.renderDetail();
        } catch (e) {
            detail.innerHTML = `<div class="card-body"><div class="error-state">${Icons.get('alert-circle',{size:32})}<p>${e.message || 'Erreur'}</p></div></div>`;
        }
    },

    renderDetail() {
        const detail = document.getElementById('groups-detail');
        if (!detail || !this.selectedGroup) return;

        const g = this.selectedGroup;
        const clientName = g.client?.name || '—';
        const clientPhone = g.client?.phone || '—';
        const totalWeight = (g.packages || []).reduce((sum, p) => sum + (p.effective_weight || p.weight || 0), 0);
        const totalCbm = (g.packages || []).reduce((sum, p) => sum + (p.effective_cbm || p.cbm || 0), 0);

        detail.innerHTML = `
            <div class="card-body">
                <!-- Header détail -->
                <div class="grp-detail-header">
                    <div>
                        <div class="grp-detail-number">${g.group_number}</div>
                        <div class="grp-detail-client">
                            ${Icons.get('user',{size:14})} <strong>${clientName}</strong>
                            <span class="text-muted">· ${clientPhone}</span>
                        </div>
                    </div>
                    ${this.renderStatusBadge(g.status)}
                </div>

                ${g.client_notes ? `
                    <div class="grp-note">
                        <strong>Note du client :</strong> ${g.client_notes}
                    </div>
                ` : ''}

                ${g.rejection_reason ? `
                    <div class="grp-note grp-note-error">
                        <strong>Motif de rejet :</strong> ${g.rejection_reason}
                    </div>
                ` : ''}

                ${g.admin_notes ? `
                    <div class="grp-note">
                        <strong>Note interne :</strong> ${g.admin_notes}
                    </div>
                ` : ''}

                <!-- Stats rapides -->
                <div class="grp-stats">
                    <div class="grp-stat">
                        <div class="grp-stat-label">Colis reçus</div>
                        <div class="grp-stat-value">${g.received_count} / ${g.package_count}</div>
                    </div>
                    <div class="grp-stat">
                        <div class="grp-stat-label">Poids total</div>
                        <div class="grp-stat-value">${totalWeight.toFixed(1)} kg</div>
                    </div>
                    ${totalCbm > 0 ? `
                        <div class="grp-stat">
                            <div class="grp-stat-label">Volume total</div>
                            <div class="grp-stat-value">${totalCbm.toFixed(3)} m³</div>
                        </div>
                    ` : ''}
                </div>

                <!-- Actions -->
                ${this.renderActions(g)}

                <!-- Liste des colis avec photos -->
                <h3 class="grp-section-title">Colis du groupage (${g.package_count})</h3>
                <div class="grp-packages-grid">
                    ${(g.packages || []).map(p => this.renderPackageCard(p, g)).join('')}
                </div>
            </div>
        `;

        this.attachDetailEvents();
    },

    renderPackageCard(p, group) {
        const status = CONFIG.PACKAGE_STATUSES[p.status] || { label: p.status };
        const isReceived = ['received','in_transit','arrived_port','customs','out_for_delivery','delivered'].includes(p.status);
        const photo = (p.photos && p.photos.length > 0) ? p.photos[0] : null;
        const canRemove = group.status === 'pending_approval' || group.status === 'approved' || group.status === 'ready_consolidation';

        return `
            <div class="grp-pkg-card ${isReceived ? 'is-received' : 'is-pending'}">
                <div class="grp-pkg-photo" data-package-id="${p.id}">
                    ${photo ? `
                        <img src="${photo.url}" alt="${p.tracking_number}" data-url="${photo.url}">
                        ${p.photos.length > 1 ? `<span class="grp-pkg-photo-count">+${p.photos.length - 1}</span>` : ''}
                    ` : `
                        <div class="grp-pkg-photo-placeholder">
                            ${Icons.get('camera',{size:32})}
                            <span class="text-xs text-muted">Aucune photo</span>
                        </div>
                    `}
                    ${isReceived ? `<span class="grp-pkg-received-badge" title="Reçu">${Icons.get('check',{size:14})}</span>` : ''}
                </div>
                <div class="grp-pkg-info">
                    <div class="grp-pkg-tracking">
                        <a href="#/packages/${p.id}" onclick="event.stopPropagation()">${p.tracking_number}</a>
                    </div>
                    <div class="grp-pkg-desc">${p.description || '—'}</div>
                    <div class="grp-pkg-meta">
                        <span class="status-badge status-${p.status}">${status.label}</span>
                        ${p.effective_weight ? `<span class="text-xs text-muted">${p.effective_weight} kg</span>` : ''}
                    </div>
                </div>
                ${canRemove ? `
                    <button class="grp-pkg-remove" data-package-id="${p.id}" title="Retirer du groupage">
                        ${Icons.get('x',{size:14})}
                    </button>
                ` : ''}
            </div>
        `;
    },

    renderActions(g) {
        if (g.status === 'pending_approval') {
            return `
                <div class="grp-actions">
                    <button class="btn btn-success" id="btn-grp-approve">
                        ${Icons.get('check',{size:16})} Approuver
                    </button>
                    <button class="btn btn-error" id="btn-grp-reject">
                        ${Icons.get('x',{size:16})} Rejeter
                    </button>
                </div>
            `;
        }
        if (g.status === 'approved') {
            return `
                <div class="grp-actions-info">
                    ${Icons.get('clock',{size:16})}
                    En attente de la réception de tous les colis (${g.received_count}/${g.package_count})
                </div>
                <div class="grp-actions">
                    <button class="btn btn-outline btn-error" id="btn-grp-reject">
                        ${Icons.get('x',{size:16})} Rejeter
                    </button>
                </div>
            `;
        }
        if (g.status === 'ready_consolidation') {
            return `
                <div class="grp-actions-info grp-actions-info-ready">
                    ${Icons.get('check-circle',{size:16})}
                    <strong>Tous les colis sont reçus.</strong> Consolidation physique requise puis assignation à un départ.
                </div>
                <div class="grp-actions">
                    <button class="btn btn-primary" id="btn-grp-consolidate">
                        ${Icons.get('package',{size:16})} Consolider et assigner un départ
                    </button>
                </div>
            `;
        }
        if (g.status === 'consolidated') {
            return `
                <div class="grp-actions-info grp-actions-info-success">
                    ${Icons.get('check-circle',{size:16})}
                    Groupage consolidé le ${g.consolidated_at ? new Date(g.consolidated_at).toLocaleDateString('fr-FR') : ''}
                </div>
            `;
        }
        if (g.status === 'rejected') {
            return `
                <div class="grp-actions-info grp-actions-info-error">
                    ${Icons.get('x-circle',{size:16})}
                    Cette demande de groupage a été rejetée.
                </div>
            `;
        }
        return '';
    },

    attachEvents() {
        // Filtres
        document.getElementById('grp-filter-search')?.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.loadGroups(), 300);
        });
        document.getElementById('grp-filter-status')?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadGroups();
        });
        document.getElementById('btn-refresh-groups')?.addEventListener('click', () => this.loadGroups());
    },

    attachDetailEvents() {
        // Approve / Reject / Consolidate
        document.getElementById('btn-grp-approve')?.addEventListener('click', () => this.approveGroup());
        document.getElementById('btn-grp-reject')?.addEventListener('click', () => this.rejectGroup());
        document.getElementById('btn-grp-consolidate')?.addEventListener('click', () => this.consolidateGroup());

        // Lightbox sur photo de colis
        document.querySelectorAll('.grp-pkg-photo img').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                Modal.open({
                    title: 'Photo du colis',
                    content: `<img src="${img.dataset.url}" style="width:100%;border-radius:var(--radius-md);">`,
                    size: 'lg'
                });
            });
        });

        // Retirer un colis du groupage
        document.querySelectorAll('.grp-pkg-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pkgId = btn.dataset.packageId;
                if (!confirm('Retirer ce colis du groupage ? Il redeviendra indépendant.')) return;
                try {
                    await API.groups.removePackage(this.selectedGroup.id, pkgId);
                    Toast.success('Colis retiré');
                    await this.openDetail(this.selectedGroup.id);
                    await this.loadGroups();
                } catch (err) {
                    Toast.error(err.message || 'Erreur');
                }
            });
        });
    },

    async approveGroup() {
        const notes = prompt('Note interne (optionnel) :');
        try {
            await API.groups.approve(this.selectedGroup.id, notes ? { admin_notes: notes } : {});
            Toast.success('Groupage approuvé');
            await this.openDetail(this.selectedGroup.id);
            await this.loadGroups();
        } catch (e) {
            Toast.error(e.message || 'Erreur');
        }
    },

    async rejectGroup() {
        const reason = prompt('Motif du rejet (visible par le client) :');
        if (!reason || !reason.trim()) return;
        try {
            await API.groups.reject(this.selectedGroup.id, reason.trim());
            Toast.success('Groupage rejeté');
            await this.openDetail(this.selectedGroup.id);
            await this.loadGroups();
        } catch (e) {
            Toast.error(e.message || 'Erreur');
        }
    },

    async consolidateGroup() {
        // Charger les départs disponibles si pas déjà fait
        if (!this.departures.length) {
            try {
                const dep = await API.departures.getAll({ status: 'scheduled' });
                this.departures = dep.departures || [];
            } catch {
                this.departures = [];
            }
        }

        const g = this.selectedGroup;
        const firstPkg = g.packages?.[0];

        // Filtrer les départs compatibles (même mode + même destination)
        const compatible = this.departures.filter(d =>
            d.status === 'scheduled' &&
            (!firstPkg || d.transport_mode === firstPkg.transport_mode) &&
            (!firstPkg || d.dest_country === firstPkg.destination?.country)
        );

        const departureOptions = compatible.length
            ? compatible.map(d => {
                const date = new Date(d.departure_date).toLocaleDateString('fr-FR');
                const dest = CONFIG.DESTINATIONS?.[d.dest_country]?.label || d.dest_country;
                return `<option value="${d.id}">${date} — ${dest} (${d.transport_mode})</option>`;
            }).join('')
            : '<option value="" disabled>Aucun départ compatible disponible</option>';

        Modal.open({
            title: `Consolider ${g.group_number}`,
            content: `
                <p class="text-sm text-muted">Tous les colis du groupage seront assignés au départ choisi et marqués comme consolidés.</p>
                <div class="form-group">
                    <label class="form-label">Départ à assigner *</label>
                    <select id="grp-consolidate-departure" class="form-input" required>
                        <option value="">Sélectionner un départ...</option>
                        ${departureOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Note interne (optionnel)</label>
                    <textarea id="grp-consolidate-notes" class="form-input" rows="2" placeholder="Localisation du carton, références..."></textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-ghost" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-confirm-consolidate">Consolider</button>
            `
        });

        document.getElementById('btn-confirm-consolidate')?.addEventListener('click', async () => {
            const departureId = document.getElementById('grp-consolidate-departure').value;
            const notes = document.getElementById('grp-consolidate-notes').value.trim();

            if (!departureId) {
                Toast.error('Veuillez sélectionner un départ');
                return;
            }

            try {
                await API.groups.consolidate(g.id, {
                    departure_id: departureId,
                    admin_notes: notes || undefined
                });
                Toast.success('Groupage consolidé');
                Modal.close();
                await this.openDetail(g.id);
                await this.loadGroups();
            } catch (e) {
                Toast.error(e.message || 'Erreur');
            }
        });
    }
};
