import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import * as dotenv from 'dotenv'
import { createApi } from 'unsplash-js'
import { BlobServiceClient } from '@azure/storage-blob'
import * as nodeFetch from 'node-fetch'
import validate from '../src/types/Images.d.validator'
import { Image } from '../src/types/Images'
import { ManagedIdentityCredential } from '@azure/identity'

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest,
): Promise<void> {
  interface ImageDownloaded {
    imageUrl: string
  }

  interface ImageUploaded {
    blobName: string
    blobUrl: string
  }

  interface Result {
    subject: string
    url: string
    download: ImageDownloaded[]
    upload: ImageUploaded[]
  }

  // Convert stream to text
  const streamToText = async (readable) => {
    readable.setEncoding('utf8')
    let data = ''
    for await (const chunk of readable) {
      data += chunk
    }
    return data
  }

  const checkNonBlacklistedPhoto = (apiResponse, blacklist) => {
    for (const image of apiResponse.response) {
      if (blacklist.alt_description.indexOf(image.alt_description) !== -1) {
        return false
      }
    }

    return true
  }

  const saveResults = async (
    blobServiceClient: BlobServiceClient,
    results: Result[],
  ) => {
    const blobName = 'imagesDownloaded.json'
    const containerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_STORAGE_ACCOUNT_CONTAINER_NAME,
    )
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)

    const arrayData = JSON.stringify(results)
    const dataArray = new TextEncoder().encode(arrayData)
    await blockBlobClient.uploadData(dataArray)
  }

  // Validate body
  try {
    validate(req.body)
  } catch (error) {
    context.res = {
      status: 400,
      body: error.message,
    }

    return
  }

  try {
    dotenv.config()
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY

    // Unsplash API client
    const unsplashApi = createApi({
      accessKey: unsplashKey,
      fetch: nodeFetch.default as unknown as typeof fetch,
    })

    // Azure Blob Storage client
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw Error('Azure Storage Connection string not found')
    }
    // Create the BlobServiceClient object with connection string
    // const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
    const credential = new ManagedIdentityCredential()
    const blobServiceClient = new BlobServiceClient(
      'https://dailyimage.blob.core.windows.net',
      credential,
    )

    // Read the image blacklist
    const blacklistBlobName = `blacklist.json`
    const blacklistContainerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_STORAGE_ACCOUNT_BLACKLIST_CONTAINER_NAME,
    )
    const blacklistBlockBlobClient =
      blacklistContainerClient.getBlockBlobClient(blacklistBlobName)
    const downloadBlockBlobResponse = await blacklistBlockBlobClient.download(0)
    const downloaded = await streamToText(
      downloadBlockBlobResponse.readableStreamBody,
    )
    const blacklist = JSON.parse(downloaded)

    // Process images
    const results = []
    const processImages = req.body.images.map(async (image: Image) => {
      const subject = image.subject
      const formats = image.formats

      let response
      let gotPhoto = false

      // Call the API until we get one non blacklisted photo
      while (!gotPhoto) {
        // get 1 photo
        response = await unsplashApi.photos.getRandom({
          query: subject,
          orientation: 'landscape',
          count: 1,
        })

        gotPhoto = checkNonBlacklistedPhoto(response, blacklist)
      }

      // extract URL
      let url: string
      let location: string
      let alt_description: string
      ;(response.response as unknown as any[]).map((response) => {
        url = response.urls.full
        location = response.links.download_location
        alt_description = response.alt_description
      })

      const download = {
        q4k: url + '&fit=crop&h=2160&w=3840',
        mac: url + '&fit=crop&h=1964&w=3024',
        iphone13Pro: url + '&fit=crop&h=2532&w=1170',
        galaxyA51: url + '&fit=crop&h=2400&w=1080',
        galaxyJ7Pro: url + '&fit=crop&h=1920&w=1080',
        galaxyS9P: url + '&fit=crop&h=2960&w=1440',
        iPad: url + '&fit=crop&h=2360&w=1640',
      }

      const imagesDownloaded: ImageDownloaded[] = []
      const blobsUploaded: ImageUploaded[] = []

      const processFormats = formats.map(async (format: string) => {
        // download photo
        const url = download[format]
        const responseDl = await nodeFetch.default(url)
        const blob = await responseDl.blob()
        const arrayBuffer = await (blob as unknown as any).arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // upload to Azure storage account
        const blobName = `${subject}-${format}.jpg`
        const containerClient = blobServiceClient.getContainerClient(
          process.env.AZURE_STORAGE_ACCOUNT_CONTAINER_NAME,
        )
        const blockBlobClient = containerClient.getBlockBlobClient(blobName)
        const data = buffer
        await blockBlobClient.upload(data, data.length)

        // fill response
        const downloaded = {
          imageUrl: url,
        }
        imagesDownloaded.push(downloaded)
        const uploaded = {
          blobName: blobName,
          blobUrl: blockBlobClient.url,
        }
        blobsUploaded.push(uploaded)
      })

      await unsplashApi.photos.trackDownload({
        downloadLocation: location,
      })

      await Promise.all(processFormats)
      const result = {
        subject,
        url,
        alt_description,
        download: imagesDownloaded,
        upload: blobsUploaded,
      }
      results.push(result)
    })

    await Promise.all(processImages)
    await saveResults(blobServiceClient, results)
    context.res = {
      body: {
        results,
      },
    }
  } catch (error) {
    context.res = {
      status: 500,
      body: error,
    }
    return
  }
}

export default httpTrigger
