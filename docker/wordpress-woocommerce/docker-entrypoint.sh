#!/bin/bash
set -e

# Wait for MySQL (host may be "mysql:3306", use host only for ping)
DB_HOST="${WORDPRESS_DB_HOST%%:*}"
until mysqladmin ping -h"${DB_HOST}" -u"${WORDPRESS_DB_USER}" -p"${WORDPRESS_DB_PASSWORD}" --silent 2>/dev/null; do
  echo "Waiting for MySQL at ${DB_HOST}..."
  sleep 2
done

# Install WordPress if not already installed (first run)
if ! wp core is-installed --path=/var/www/html --allow-root 2>/dev/null; then
  wp core install \
    --path=/var/www/html \
    --url="${WORDPRESS_URL:-http://localhost}" \
    --title="${WORDPRESS_TITLE:-Store}" \
    --admin_user="${WORDPRESS_ADMIN_USER:-admin}" \
    --admin_password="${WORDPRESS_ADMIN_PASSWORD:-admin}" \
    --admin_email="${WORDPRESS_ADMIN_EMAIL:-admin@example.com}" \
    --skip-email \
    --allow-root
fi

# Install and activate WooCommerce (idempotent)
wp plugin install woocommerce --activate --path=/var/www/html --allow-root 2>/dev/null || true

# Enable COD (Cash on Delivery) for test checkout
wp option update woocommerce_cod_settings '{"enabled":"yes","title":"Cash on Delivery","description":"Pay with cash upon delivery.","instructions":"Pay with cash upon delivery.","enable_for_methods":"","enable_for_virtual":"yes"}' --format=json --path=/var/www/html --allow-root 2>/dev/null || true

exec "$@"
