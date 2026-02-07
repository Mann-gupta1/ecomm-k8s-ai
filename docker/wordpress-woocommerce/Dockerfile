# WordPress + WooCommerce: install WooCommerce at runtime so store is ready without manual steps.
FROM wordpress:6.4-php8.2-apache

# Install wp-cli and mysql client for DB wait
RUN apt-get update && apt-get install -y --no-install-recommends default-mysql-client curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
  && chmod +x wp-cli.phar \
  && mv wp-cli.phar /usr/local/bin/wp

# Custom entrypoint: wait for DB, install WordPress if needed, install WooCommerce, then start Apache
COPY docker-entrypoint.sh /usr/local/bin/custom-entrypoint.sh
RUN chmod +x /usr/local/bin/custom-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
CMD ["apache2-foreground"]
