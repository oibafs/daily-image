import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as dotenv from 'dotenv'
import { createApi } from "unsplash-js"
import { BlobServiceClient } from "@azure/storage-blob"
import * as nodeFetch from 'node-fetch'
import validate from "../src/types/Images.d.validator"
import { Image } from "../src/types/Images"

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {

  // Validate body
  try {
    validate(req.body)

  } catch (error) {
    context.res = {
      status: 400,
      body: error.message
    }

    return
  }

  try {
    dotenv.config()
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY

    // Unsplash API client
    const unsplashApi = createApi({
      accessKey: unsplashKey,
      fetch: nodeFetch.default as unknown as typeof fetch
    })

    // Azure Blob Storage client
    const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw Error('Azure Storage Connection string not found')
    }
    // Create the BlobServiceClient object with connection string
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)

    // Process images
    const results = []
    const processImages = req.body.images.map(async (image: Image) => {
      const subject = image.subject
      const formats = image.formats

      // get 1 photo
      const response = await unsplashApi.photos.getRandom({
        query: subject,
        orientation: "landscape",
        count: 1
      })

      // extract URL
      let url: string
      let location: string
      (response.response as unknown as any[]).map((response) => {
        url = response.urls.full
        location = response.links.download_location
      })

      const download = {
        q4k: url + '&fit=crop&h=2160&w=3840',
        mac: url + '&fit=crop&h=1964&w=3024',
        iphone13Pro: url + '&fit=crop&h=2532&w=1170',
        galaxyA51: url + '&fit=crop&h=2400&w=1080',
        galaxyJ7Pro: url + '&fit=crop&h=1920&w=1080',
        galaxyS9P: url + '&fit=crop&h=2960&w=1440'
      }

      const imagesDownloaded = []
      const blobsUploaded = []

      const processFormats = formats.map(async (format: string) => {
        // download photo
        const url = download[format]
        const responseDl = await nodeFetch.default(url);
        const blob = await responseDl.blob();
        const arrayBuffer = await (blob as unknown as any).arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // upload to Azure storage account
        const blobName = `${subject}-${format}.jpg`
        const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_ACCOUNT_CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const data = buffer
        await blockBlobClient.upload(data, data.length);

        // fill response
        const downloaded = {
          "imageUrl": url
        }
        imagesDownloaded.push(downloaded)
        const uploaded = {
          "blobName": blobName,
          "blobUrl": blockBlobClient.url
        }
        blobsUploaded.push(uploaded)
      })

      await unsplashApi.photos.trackDownload({
        downloadLocation: location
      })

      await Promise.all(processFormats)
      const result = {
        subject,
        url,
        download: imagesDownloaded,
        upload: blobsUploaded
      }
      results.push(result)
    })

    await Promise.all(processImages)
    context.res = {
      body: {
        results
      }
    }

  }

  catch (error) {
    context.res = {
      status: 500,
      body: error
    }
    return
  }

};

export default httpTrigger;