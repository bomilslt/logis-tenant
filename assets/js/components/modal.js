/**
 * Modal - Boites de dialogue
 */

const Modal = {
    container: null,
    currentOptions: null,
    
    init() {
        this.container = document.getElementById('modal-container');
    },
    
    open(options = {}) {
        if (!this.container) this.init();
        
        const { title = '', content = '', footer = '', closable = true, onClose = null, size = '' } = options;
        this.currentOptions = options;
        const sizeClass = size ? `modal-${size}` : '';
        
        this.container.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop"></div>
            <div class="modal ${sizeClass}">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    ${closable ? `
                        <button class="modal-close" id="modal-close-btn">
                            <svg class="icon" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#x"></use></svg>
                        </button>
                    ` : ''}
                </div>
                <div class="modal-body">${content}</div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        `;
        
        // Attacher les événements seulement si closable
        if (closable) {
            document.getElementById('modal-backdrop')?.addEventListener('click', () => {
                this.close();
                if (onClose) onClose();
            });
            document.getElementById('modal-close-btn')?.addEventListener('click', () => {
                this.close();
                if (onClose) onClose();
            });
        }
        
        document.body.style.overflow = 'hidden';
    },
    
    close() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        document.body.style.overflow = '';
        this.currentOptions = null;
    },
    
    confirm(options = {}) {
        return new Promise((resolve) => {
            const { title = 'Confirmation', message = 'Etes-vous sur ?', confirmText = 'Confirmer', cancelText = 'Annuler', danger = false } = options;
            
            this.open({
                title,
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>
                `,
                onClose: () => resolve(false)
            });
            
            document.getElementById('modal-cancel').addEventListener('click', () => { this.close(); resolve(false); });
            document.getElementById('modal-confirm').addEventListener('click', () => { this.close(); resolve(true); });
        });
    },
    
    prompt(options = {}) {
        return new Promise((resolve) => {
            const { title = 'Saisie', message = '', placeholder = '', defaultValue = '' } = options;
            
            this.open({
                title,
                content: `
                    ${message ? `<p class="mb-md">${message}</p>` : ''}
                    <input type="text" class="form-input" id="modal-input" placeholder="${placeholder}" value="${defaultValue}">
                `,
                footer: `
                    <button class="btn btn-secondary" id="modal-cancel">Annuler</button>
                    <button class="btn btn-primary" id="modal-confirm">OK</button>
                `,
                onClose: () => resolve(null)
            });
            
            const input = document.getElementById('modal-input');
            input.focus();
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.close(); resolve(input.value.trim() || null); } });
            document.getElementById('modal-cancel').addEventListener('click', () => { this.close(); resolve(null); });
            document.getElementById('modal-confirm').addEventListener('click', () => { this.close(); resolve(input.value.trim() || null); });
        });
    },
    
    form(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Formulaire',
                content = '',
                confirmText = 'Enregistrer',
                cancelText = 'Annuler',
                size = '',
                onOpen = null,
                onSubmit = null  // async callback; return true (or undefined) to close, false to keep modal open (for retry after error)
            } = options;
            
            let settled = false;
            const settle = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            
            this.open({
                title,
                content: `<div class="modal-form-content">${content}</div>`,
                footer: `
                    <button class="btn btn-secondary" id="modal-form-cancel">${cancelText}</button>
                    <button class="btn btn-primary" id="modal-form-confirm">${confirmText}</button>
                `,
                size,
                closable: true,
                onClose: () => settle(false)
            });
            
            // Attacher les events après un court délai pour s'assurer que le DOM est prêt
            requestAnimationFrame(() => {
                if (onOpen) onOpen();
                
                const cancelBtn = document.getElementById('modal-form-cancel');
                const confirmBtn = document.getElementById('modal-form-confirm');
                
                if (cancelBtn) {
                    cancelBtn.onclick = () => { 
                        this.close(); 
                        settle(false); 
                    };
                }
                
                if (confirmBtn) {
                    if (onSubmit) {
                        // Mode callback: l'utilisateur peut re-cliquer apres une erreur
                        let busy = false;
                        confirmBtn.onclick = async () => {
                            if (busy) return; // anti double-clic pendant l'appel
                            busy = true;
                            try {
                                const result = await onSubmit();
                                // result === false => garder la modale ouverte (erreur cote caller)
                                if (result !== false) {
                                    this.close();
                                    settle(true);
                                }
                            } catch (e) {
                                console.error('Modal.form onSubmit threw:', e);
                                // Garder la modale ouverte pour permettre une nouvelle tentative
                            } finally {
                                busy = false;
                            }
                        };
                    } else {
                        // Mode legacy (Promise resolve une fois)
                        confirmBtn.onclick = () => settle(true);
                    }
                }
            });
        });
    },
    
    // Fermer le modal manuellement (utile apres Modal.form)
    closeForm() {
        this.close();
    }
};
