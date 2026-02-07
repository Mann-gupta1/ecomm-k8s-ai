export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  storeNamespacePrefix: process.env.STORE_NAMESPACE_PREFIX || 'store',
  storeLabel: 'urumi.ai/store',
  storeInfoConfigMapName: 'store-info',
  // Ingress host template: one %s for store id. Local: use nip.io e.g. store-%s.127.0.0.1.nip.io
  ingressHostTemplate: process.env.INGRESS_HOST_TEMPLATE || 'store-%s.127.0.0.1.nip.io',
  // Provisioning timeout (ms)
  provisioningTimeoutMs: parseInt(process.env.PROVISIONING_TIMEOUT_MS || '600000', 10), // 10 min default
  // Max stores (abuse prevention). 0 = no limit.
  maxStores: parseInt(process.env.MAX_STORES || '20', 10),
  // Custom WordPress+WooCommerce image (build from docker/wordpress-woocommerce for full auto-setup).
  wordpressWooCommerceImage: process.env.WORDPRESS_WOOCOMMERCE_IMAGE || 'wordpress:6.4-php8.2-apache',
  // Rate limit: max create-store requests per IP per window (windowMs). 0 = disabled.
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxCreates: parseInt(process.env.RATE_LIMIT_MAX_CREATES || '10', 10),
  // Max concurrent provisioning operations (abuse prevention). 0 = no limit.
  maxConcurrentProvisioning: parseInt(process.env.MAX_CONCURRENT_PROVISIONING || '2', 10),
};

export function getStoreNamespace(storeId: string): string {
  return `${config.storeNamespacePrefix}-${storeId}`;
}
