import * as dotenv from "dotenv"
import log4js from "log4js"
import fs from 'fs';
import axios from 'axios';
import {createObjectCsvWriter} from 'csv-writer';
import ProgressBar from "progress"
import util from "util";
import dns from "node:dns";
import * as https from "https";

const dnsLookup = util.promisify(dns.lookup)

dotenv.config()

//////////////////LOGGER//////////////////////////////////////////////
log4js.configure({
    appenders: {
        console: {type: "console"}, layout: {
            type: "pattern",
            pattern: "%[[%d{dd.MM.yy hh:mm:ss}] [%p] %c -%] %m%n"
        }
    },
    categories: {
        default: {appenders: ["console"], level: "all"}
    }
})
const logger = log4js.getLogger()
logger.level = process.env.NODE_ENV && process.env.NODE_ENV === "production" ? "info" : "debug"


////////////////////////////////////////////////////////////
setup()

async function setup() {
    await processCsv('data/urls_in.csv', 'data/urls_out.csv');
}

// Function to check URL and get detailed information
async function checkUrl(url) {
    let redirectCount = -1
    let statusCode = -1
    let finalUrl = ""
    let finalServer = ""
    let remarks = ""

    try {
        let response = await axios.get(url, {
            maxRedirects: 10,
            headers: {"User-Agent": "bulk_url_check"},
            validateStatus: function (status) {
                statusCode = status;
                return status < 400;
            }
        });
        finalUrl = response.request.res.responseUrl || finalUrl
        redirectCount = response.request._redirectable._redirectCount
        finalServer = response.request.socket.remoteAddress
    } catch (error) {
        if (error.toString().includes("getaddrinfo ENOTFOUND")) {
            finalUrl = "---"
            statusCode = "---"
            redirectCount = "---"
            finalServer = "---"
            remarks = "No DNS entry"
        }
        else if(error.toString().includes("Error: certificate has expired")){
            const nonSslCheckingAxios = axios.create({
                httpsAgent: new https.Agent({
                    rejectUnauthorized:false
                })
            })
            let response = await nonSslCheckingAxios.get(url, {
                maxRedirects: 10,
                headers: {"User-Agent": "bulk_url_check"},
                validateStatus: function (status) {
                    statusCode = status;
                    return status < 400;
                }
            });
            finalUrl = response.request.res.responseUrl || finalUrl
            redirectCount = response.request._redirectable._redirectCount
            finalServer = response.request.socket.remoteAddress
            remarks = "SSL Certificate expired"
        }else {
            try {
                finalUrl = error.response ? error.response.config.url : 'Error';
                statusCode = error.response ? error.response.status : 'Error';
                redirectCount = error.request._redirectable._redirectCount
                finalServer = error.request.socket.remoteAddress
            } catch (e) {
                logger.error(`error prcessing ${url}`)
                console.log(error.toString());
            }

        }
    }

    if (!finalServer) {
        const noScheme = finalUrl.replace("http://", "").replace("https://", "")
        const {address} = await dnsLookup(noScheme.substring(0, noScheme.indexOf("/")).trim());
        finalServer = address
    }
    return {sourceUrl: url, finalUrl, redirectCount, statusCode, finalServer, remarks};
}

// Function to process CSV file
async function processCsv(inputFile, outputFile) {
    const urls = fs.readFileSync(inputFile, 'utf8').split('\n');
    logger.log(`Processing ${urls.length} URL${urls.length === 1 ? "" : "s"}`)
    const processedResults = [];
    const bar = new ProgressBar(":bar", {total: urls.length, width: 50})

    for (let url of urls) {
        bar.tick()
        url=url.trim()
        if (url && url !== "\r") { // Skip empty lines
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url
            const result = await checkUrl(url);
            processedResults.push(result);
        }
    }

    // Write the results to a new CSV file
    const csvWriter = createObjectCsvWriter({
        path: outputFile,
        header: [
            {id: 'sourceUrl', title: 'Source URL'},
            {id: 'finalUrl', title: 'Destination URL'},
            {id: 'redirectCount', title: 'Number of Redirects'},
            {id: 'statusCode', title: 'Status Code'},
            {id: "finalServer", title: "Destination Server"},
            {id: "remarks", title: "Additional remarks"}
        ]
    });

    csvWriter.writeRecords(processedResults)
        .then(() => {
            logger.log('CSV file was written successfully')
            process.exit(0)
        })
}
