const fs = require('fs');
const axios = require('axios');
const dns = require('dns').promises;
const { exec } = require('child_process');
const cron = require('node-cron');
const chokidar = require('chokidar');
const path = require('path');
const logFile = '/var/www/logs/letsencrypt.log';
const acmeLogFile = '/var/www/logs/acmesh.log';

const domainsFile = 'domains.json';
const sharedWebroot = '/var/www/shared-webroot';
const expectedContent = 'test'; // Očekávaný obsah testovacího souboru

function logMessage(message) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
}

async function verifyDomain(domain) {
    try {
        const response = await axios.get(`http://${domain}/.well-known/acme-challenge/test-file.txt`);
        return response.status === 200 && response.data.trim() === expectedContent;
    } catch (error) {
        return false;
    }
}

async function verifyDomainIPv6(domain) {
    try {
        const ipv6Addresses = await dns.resolve6(domain);
        if (ipv6Addresses.length > 0) {
            try {
                const response = await axios.get(`http://${domain}/.well-known/acme-challenge/test-file.txt`, { family: 6 });
                return response.status === 200 && response.data.trim() === expectedContent;
            } catch (error) {
                return false;
            }
        }
    } catch (error) {
        if (error.code === 'ENODATA' || error.code === 'ENOTFOUND' || error.code === 'ENOTIMP' || error.code === 'EINVAL') {
            // No IPv6 record found, continue as valid
            return true;
        }
        // Other errors should be handled as failures
        return false;
    }
    return false;
}

function generateCertificate(domains) {
    return new Promise((resolve, reject) => {
        const domainArgs = domains.map(d => `-d ${d}`).join(' ');
        const certHome = '/var/www/certs';
        const command = `LOG_FILE=${acmeLogFile} ~/.acme.sh/acme.sh --issue ${domainArgs} --webroot ${sharedWebroot} --cert-home ${certHome} --keylength 2048`;
        logMessage(`Executing command: ${command}`);
        exec(command, (error, stdout, stderr) => {
            logMessage(`Command stdout: ${stdout}`);
            logMessage(`Command stderr: ${stderr}`);
            if (error) {
                if (stderr.includes('Domains not changed.') || stderr.includes('Skip, Next renewal time is')) {
                    resolve(`No need to renew certificate for ${domains.join(', ')}: ${stderr}`);
                } else {
                    reject(`error: ${error.message}\nACME log:\n${stderr}`);
                }
            } else if (stderr) {
                reject(`stderr: ${stderr}`);
            } else {
                const domain = domains[0];
                const certPath = path.join(certHome, domain);
                const targetPath = path.join('/var/www/nginx', domain);

                // Vytvoření cílové složky pokud neexistuje
                if (!fs.existsSync(targetPath)){
                    fs.mkdirSync(targetPath, { recursive: true });
                }

                // Kopírování certifikátů
                try {
                    fs.copyFileSync(path.join(certPath, `${domain}.cer`), path.join(targetPath, 'cert.pem'));
                    fs.copyFileSync(path.join(certPath, `${domain}.key`), path.join(targetPath, 'priv.key'));
                    resolve(`Certificate and key copied to ${targetPath}`);
                } catch (copyError) {
                    reject(`Copy error: ${copyError.message}`);
                }
            }
        });
    });
}

async function processDomains() {
    const domains = JSON.parse(fs.readFileSync(domainsFile));
    for (const entry of domains) {
        const domain = entry.domain;
        const wwwDomain = `www.${domain}`;

        const [isDomainVerified, isWwwDomainVerified, isDomainIPv6Verified, isWwwDomainIPv6Verified] = await Promise.all([
            verifyDomain(domain),
            verifyDomain(wwwDomain),
            verifyDomainIPv6(domain),
            verifyDomainIPv6(wwwDomain)
        ]);

        if (isDomainVerified && isDomainIPv6Verified) {
            const domainsToCertify = (isWwwDomainVerified && isWwwDomainIPv6Verified) ? [domain, wwwDomain] : [domain];
            try {
                const result = await generateCertificate(domainsToCertify);
                logMessage(`Certificate generated or validated for ${domainsToCertify.join(', ')}: ${result}`);
            } catch (error) {
                logMessage(`Failed to generate certificate for ${domain}: ${error}`);
            }
        } else {
            logMessage(`Domain verification failed for ${domain}`);
        }
    }
}

// Cron job to run every hour
cron.schedule('0 * * * *', () => {
    logMessage('Running scheduled job...');
    processDomains();
});

// Watcher to detect changes in the domains.json file
chokidar.watch(domainsFile).on('change', () => {
    logMessage('Detected changes in domains.json. Running job...');
    processDomains();
});

// Initial run
processDomains();
