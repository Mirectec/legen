# legen

docker stop dc_legen
docker rm dc_legen
docker build -t dc_legen .
docker run -d --name dc_legen -v /home/nodejsApps/msconfig/leGen/domains.json:/usr/src/app/domains.json -v /home/server/dc_legen/certs:/var/www/certs -v /home/server/dc_nginx/letsencrypt:/var/www/shared-webroot -v /home/server/dc_nginx/certs:/var/www/nginx -v /home/server/dc_legen/logs:/var/www/logs dc_legen
