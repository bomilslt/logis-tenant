/**
 * Push Notifications Service - Tenant Web
 * Gère les notifications push pour PWA et Capacitor (natif tablette/mobile)
 */

const TenantPushService = {
    VAPID_PUBLIC_KEY: 'YOUR_VAPID_PUBLIC_KEY_HERE',
    
    _initialized: false,
    _permission: 'default',
    _subscription: null,
    _isNative: false,
    
    /**
     * Initialiser le service push
     */
    async init() {
        if (this._initialized) return;
        
        // Detecter si on est dans Capacitor (app native - tablette/mobile)
        this._isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
        
        if (this._isNative) {
            await this._initNative();
        } else {
            await this._initWeb();
        }
        
        this._initialized = true;
    },
    
    /**
     * Init pour app native (Capacitor - compilation tablette)
     */
    async _initNative() {
        try {
            // Import dynamique des plugins Capacitor
            const { PushNotifications } = await import('@capacitor/push-notifications');
            
            const permStatus = await PushNotifications.checkPermissions();
            this._permission = permStatus.receive;
            
            // Listener: Token enregistré
            PushNotifications.addListener('registration', (token) => {
                console.log('[TenantPush] Token natif reçu:', token.value);
                this._sendTokenToServer(token.value, 'fcm');
            });
            
            // Listener: Erreur d'enregistrement
            PushNotifications.addListener('registrationError', (error) => {
                console.error('[TenantPush] Erreur enregistrement:', error);
            });
            
            // Listener: Notification reçue (app ouverte)
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[TenantPush] Notification reçue:', notification);
                this._handleForegroundNotification(notification);
            });
            
            // Listener: Clic sur une notification (app en arrière-plan)
            PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                console.log('[TenantPush] Action notification:', action);
                this._handleNotificationTap(action.notification);
            });
            
        } catch (e) {
            console.warn('[TenantPush] Capacitor Push non disponible:', e);
        }
    },
    
    /**
     * Init pour PWA (Web Push via ServiceWorker)
     */
    async _initWeb() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[TenantPush] Web Push non supporté sur ce navigateur');
            return;
        }
        
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('[TenantPush] ServiceWorker enregistré');
            
            this._permission = Notification.permission;
            this._subscription = await registration.pushManager.getSubscription();
            
        } catch (e) {
            console.error('[TenantPush] Erreur ServiceWorker:', e);
        }
    },
    
    /**
     * Demander la permission et s'abonner
     */
    async requestPermission() {
        if (this._isNative) {
            return await this._requestNativePermission();
        } else {
            return await this._requestWebPermission();
        }
    },
    
    async _requestNativePermission() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            
            const permStatus = await PushNotifications.requestPermissions();
            this._permission = permStatus.receive;
            
            if (permStatus.receive === 'granted') {
                await PushNotifications.register();
                return true;
            }
            return false;
        } catch (e) {
            console.error('[TenantPush] Erreur permission native:', e);
            return false;
        }
    },
    
    async _requestWebPermission() {
        try {
            const permission = await Notification.requestPermission();
            this._permission = permission;
            
            if (permission !== 'granted') return false;
            
            const registration = await navigator.serviceWorker.ready;
            this._subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this._urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
            });
            
            await this._sendTokenToServer(JSON.stringify(this._subscription), 'webpush');
            return true;
        } catch (e) {
            console.error('[TenantPush] Erreur permission web:', e);
            return false;
        }
    },
    
    isEnabled() {
        return this._permission === 'granted';
    },
    
    isSupported() {
        if (this._isNative) return true;
        return 'serviceWorker' in navigator && 'PushManager' in window;
    },
    
    /**
     * Envoyer le token au serveur backend
     */
    async _sendTokenToServer(token, type) {
        try {
            await API.post('/notifications/push/subscribe', {
                token: token,
                type: type,
                device: this._getDeviceInfo()
            });
            console.log('[TenantPush] Token envoyé au serveur');
        } catch (e) {
            console.error('[TenantPush] Echec envoi token:', e);
        }
    },
    
    /**
     * Notification reçue en premier plan - afficher un toast
     */
    _handleForegroundNotification(notification) {
        const title = notification.title || 'Nouvelle notification';
        const body = notification.body || '';
        
        // Afficher via le système de toast existant
        if (typeof Toast !== 'undefined') {
            Toast.info(`${title}${body ? ': ' + body : ''}`);
        }
        
        // Rafraîchir le badge si disponible
        this._refreshNotificationBadge();
    },
    
    /**
     * Tap sur une notification (app background)
     */
    _handleNotificationTap(notification) {
        const data = notification.data || {};
        
        if (data.type === 'logi_pay') {
            // Naviguer vers Logi Pay
            if (typeof Router !== 'undefined') Router.navigate('/logi-pay');
        } else if (data.package_id) {
            if (typeof Router !== 'undefined') Router.navigate(`/packages/${data.package_id}`);
        } else {
            if (typeof Router !== 'undefined') Router.navigate('/notifications');
        }
    },
    
    _refreshNotificationBadge() {
        // Hook pour rafraîchir un badge dans le header si existant
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            const current = parseInt(badge.textContent || '0', 10);
            badge.textContent = current + 1;
            badge.style.display = 'flex';
        }
    },
    
    _getDeviceInfo() {
        return {
            platform: this._isNative ? (window.Capacitor?.getPlatform?.() || 'native') : 'web',
            userAgent: navigator.userAgent,
            language: navigator.language
        };
    },
    
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
};
