const fs = require('fs');
const axios = require('axios');
const dns = require('dns').promises;
const { exec } = require('child_process');
const cron = require('node-cron');
const chokidar = require('chokidar');

const domainsFile = 'domains.json';
const expectedContent = 'test'; // Očekávaný obsah testovacího souboru

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
            const response = await axios.get(`http://${domain}/.well-known/acme-challenge/test-file.txt`, { family: 6 });
            return response.status === 200 && response.data.trim() === expectedContent;
        }
    } catch (error) {
        return false;
    }
}

function generateCertificate(domains) {
    return new Promise((resolve, reject) => {
        const domainArgs = domains.map(d => `-d ${d}`).join(' ');
        exec(`~/.acme.sh/acme.sh --issue ${domainArgs} --webroot /var/www/${domains[0]}/public_html`, (error, stdout, stderr) => {
            if (error) {
                reject(`error: ${error.message}`);
            } else if (stderr) {
                reject(`stderr: ${stderr}`);
            } else {
                resolve(`stdout: ${stdout}`);
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
                console.log(`Certificate generated for ${domainsToCertify.join(', ')}: ${result}`);
            } catch (error) {
                console.error(`Failed to generate certificate for ${domain}: ${error}`);
            }
        } else {
            console.log(`Domain verification failed for ${domain}`);
        }
    }
}

// Cron job to run every hour
cron.schedule('0 * * * *', () => {
    console.log('Running scheduled job...');
    processDomains();
});

// Watcher to detect changes in the domains.json file
chokidar.watch(domainsFile).on('change', () => {
    console.log('Detected changes in domains.json. Running job...');
    processDomains();
});

// Initial run
processDomains();

