import * as dotenv from "dotenv"
import log4js from "log4js"
import mongoose from "mongoose"
import axios from "axios";
import {CronJob} from "cron"
import readline from "readline";
import fs from "fs";

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

////////////MONGODB//////////////////////////////

const sampleSchema = new mongoose.Schema({
   hello: String
})

const Sample = mongoose.model("Sample", sampleSchema)

async function connectToMongo() {
    try {
        mongoose.set('strictQuery', false)
        await mongoose.connect(`mongodb://${process.env.MONGO_IP}:${process.env.MONGO_PORT || 27017}`, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            user: process.env.MONGO_USER,
            pass: process.env.MONGO_PASSWORD,
            dbName: process.env.MONGO_TABLE_NAME
        })
        logger.info('MongoDB connected')
    } catch (error) {
        logger.fatal("Error connecting to mongodb:", error)
    }
}

////////////////////////CRON////////////////////////////////
const weeklyRefresh = new CronJob(
    '55 46 3 * * 0',
    weeklyFunction,
    null,
    true,
    'Europe/Zurich'
)

////////////////////////////////////////////////////////////
async function setup() {
    await checkEnv()
    await connectToMongo()
    weeklyRefresh.start()
}

async function checkEnv() {
    const lineReader = readline.createInterface({
        input: fs.createReadStream('./default.env')
    })
    lineReader.on('line', function (line) {
        if(line!=="") {
            const variable = line.substring(0, line.indexOf("=") > 0 ? line.indexOf("=") : line.length)
            if (!Object.keys(process.env).includes(variable)) {
                logger.error(`the ${variable} environment variable is not set`)
                process.exit(101)
            }
        }
    })

    lineReader.on('close', function () {
        logger.debug("All required environment variables are in place")
    })
}

setup()
