import { AzureFunction, Context } from "@azure/functions"
import * as dotenv from 'dotenv'
import fetch from "node-fetch"
const util = require('util')

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
  dotenv.config()
  const hostname = process.env.DOWNLOADER_HOSTNAME
  const code = process.env.AZURE_FUNCTIONS_CODE

  const body = {
    images: [
      {
        subject: "mindfulness",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "iPad"
        ]
      },
      {
        subject: "learning",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "iPad"
        ]
      },
      {
        subject: "car",
        formats: [
          "iphone13Pro",
          "iPad"
        ]
      },
      {
        subject: "running",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "iPad"
        ]
      },
      {
        subject: "landscape",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "galaxyJ7Pro",
          "galaxyS9P",
          "iPad"
        ]
      },
      {
        subject: "book",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "iPad"
        ]
      },
      {
        subject: "moon",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "iPad"
        ]
      },
      {
        subject: "heineken",
        formats: [
          "q4k",
          "mac",
          "iphone13Pro",
          "galaxyA51",
          "iPad"
        ]
      }
    ]
  }

  const response = await fetch(`${hostname}/api/getRandomPhoto?code=${code}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })
  const data = await response.json()

  context.log(util.inspect(data, false, null, true))
};

export default timerTrigger;
