# Použijte oficiální Node.js image
FROM node:lts-alpine

# Nastavte pracovní adresář
WORKDIR /usr/src/app

# Zkopírujte package.json a nainstalujte závislosti
COPY package.json ./
RUN npm install

# Zkopírujte zbytek aplikačních souborů
COPY . .

# Stáhněte a nainstalujte acme.sh
RUN apk add --no-cache bash curl openssl && \
    curl https://get.acme.sh | sh && \
    ln -s /root/.acme.sh/acme.sh /usr/local/bin/acme.sh && \
    acme.sh --set-default-ca --server letsencrypt
....
RUN rm -rf /var/cache/apk/*

# Vytvořte potřebné adresáře
RUN mkdir -p /var/www/shared-webroot /var/www/certs /var/www/nginx /var/www/logs

# Nastavte příkazy, které se mají spustit při startu kontejneru
CMD ["node", "app.js"]