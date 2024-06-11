# Použijte oficiální Node.js image
FROM node:lts-alpine

# Nastavení pracovního adresáře v kontejneru
WORKDIR /usr/src/app

# Kopírování package.json a package-lock.json do pracovního adresáře
COPY package*.json ./

# Instalace závislostí
RUN npm install

# Kopírování aplikace do pracovního adresáře
COPY . .

# Instalace acme.sh
RUN curl https://get.acme.sh | sh

# Přidání acme.sh do PATH
ENV PATH="/root/.acme.sh/:$PATH"

# Vytvoření potřebných složek
RUN mkdir -p /var/www/shared-webroot /var/www/certs /var/www/nginx /var/www/logs

# Spuštění aplikace
CMD ["node", "app.js"]
