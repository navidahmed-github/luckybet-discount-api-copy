# Lucky Bet Discount - API

## Summary

REST API for the Lucky Bet platform built using NestJS

Code was developed against node version 20.18

## Technology

-   [Node.js](https://nodejs.org/en/) - Server environment
-   [Typescript](https://www.typescriptlang.org/) - Programming language
-   [Yarn](https://yarnpkg.com/) - Package manager
-   [NestJS](https://nestjs.com/) - API framework
-   [MongoDB](https://www.mongodb.com) - NoSQL database
-   [Jest](https://jestjs.io/) - Testing framework
-   [Swagger](https://swagger.io/) - API documentation

## Getting started

### 1. Configuration

An `.env` file needs to be placed at the root for the app to work. An example file named `.env.example` is provided. Once deployed to 
Google Cloud this file will be replaced by the variables defined as part of the Cloud Run configuration

This is a summary of the environment variables:

| Name                           | Required  | Secret | Description |
|--------------------------------|-----------|--------|-------------|
| PORT                           | N         | N      | Port on which the API will listen for requests (default: 3005) |
| MONGO_CONNECTION_STRING        | Y         | Y      | Connection string to the MongoDB instance |
| PROVIDER_URL                   | Y         | Y      | URL to RPC provider used to connect to chain |
| JWT_SECRET                     | Y         | Y      | Secret used to verify that JWT has been issued by Lucky Bet <br/> MUST match that configured on the Lucky Bet authentication server | 
| WALLET_MNEMONIC                | Y         | Y      | Used to generate user private keys and associated wallet addresses |
| ADMIN_WALLET_PRIVATE_KEY       | Y         | Y      | Private key for the wallet which is used to perform all administrator actions on contracts <br/> MUST correspond to address of owner for contracts |
| LUCKYBET_WALLET_PRIVATE_KEY    | Y         | Y      | Private key for Lucky Bet wallet where tokens end up when converted to offers |
| GAS_STATION_WALLET_PRIVATE_KEY | Y         | Y      | Private key for wallet containing a pool of ETH which is used to fund contract operations |
| WALLET_GAS_AMOUNT              | Y         | N      | The amount to top-up a wallet if it is low on funds when attempting to execute contract operation |
| TOKEN_CONTRACT_ADDRESS         | Y         | N      | Deployed address of token contract |
| OFFER_CONTRACT_ADDRESS         | Y         | N      | Deployed address of offer contract |
| ENABLE_SWAGGER                 | Y         | N      | Indicates whether swagger documentation will be available |
| EVENT_FILTER_SIZE              | N         | N      | Specifies number of previous blocks to attempt to read event history from on startup |
| AIRDROP_CHUNK_SIZE             | N         | N      | Specifies how many addresses are minted to per block when performing airdrops |
| ATTRIBUTE_NAME_MAPPING         | N         |N       | Allow the 'name' field for an attribute to be renamed when retrieving metadata <br/> This is potentially useful if wanting to map to OpenSea standard so set to 'trait_type' for example |
| ATTRIBUTE_OTHER_MAPPING        | N         | N      | Allow the 'other' field for an attribute to renamed when retrieving metadata <br/> This will nearly always be mapped to some type field such as 'display_type'

### 2. Database

A local MongoDB instance can be run via `docker compose`

> docker compose up

This will create an instance which can be accessed via this connection string (given in the example configuration above)

> mongodb://localhost:27018/luckybet


### 3. Run the service

To run the API:

> yarn start:dev

If using the default, simply browse to `https://localhost:3005/swagger`

## Commands

More details in the scripts section of `./package.json`

### Installation

Download and install all dependencies into the `./node_modules` folder

> yarn

Build the project and output into the `./dist` folder

> yarn build

## Testing the app

To run the **unit** tests:

> yarn test

## Cloud Deployment

It is recommended that the API be deployed on Google Cloud using Cloud Run which is a serverless compute service (like AWS lambda). However, there is one caveat and that is that this service must be able to support background processing (ie. allow some CPU at all times) and be configured to do so as the API contains a job scheduling service used for airdrops - GCP supports this but AWS does not. 

A `cloudbuid.yaml` has been provided that should be sufficient for use on GCP. In order to upload an image execute the following inside a shell:

> ./upload-gcp.sh

**It is strongly recommended that the following also be implemented:**
- Cloudflare or some other equivalent be used in front of this service to mitigate against DDoS. 
- Billing alerts are setup to notify if any unusual activity that could cause unexpectedly large bills (this is critical as the cloud providers do not generally allow maximum billing amounts to be set) 