const axios = require("axios");
const ethers = require("ethers");

const apiHost = "http://localhost:3005";

const stakeAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";

const authTokens = {
    jwtAdmin: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqYWNrLmpvbmVzIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MDAwMDAwMDB9.dmb4WMuNPNNu1Nbaqytmzd8Dzc0rVeiZdR4xkJNkvhA",
    jwtJohnSmith: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqb2huLnNtaXRoIiwicm9sZSI6InVzZXIiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTkwMDAwMDAwMH0.jBnBda71qWeycVUZA0KprvQReFL5f22sHtw17uWtIrE",
    jwtMaryJane: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtYXJ5LmphbmUiLCJyb2xlIjoidXNlciIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxOTAwMDAwMDAwfQ.4OVR2rt7JJzS9a5ZaV96trV3ppC_aynIqML4eMOzhKU"
};

function showResponse(response) {
    console.log(response.data);
    console.log("================================================================================");
    return response;
}

async function catchResponse(fn) {
    try { await fn(); } catch (err) { console.error(err); }
    console.log("================================================================================");
}

async function awaitSeconds(seconds) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), seconds * 1000);
    });
}

// assumes staking contract is deployed with a lock time of 100s
const run = async () => {
    const http = axios.create({ baseURL: apiHost });
    const httpJwt = (jwt) => axios.create({ baseURL: apiHost, headers: { Authorization: `Bearer ${jwt}` } });
    const admin = httpJwt(authTokens.jwtAdmin);
    const johnSmith = httpJwt(authTokens.jwtJohnSmith);
    const maryJane = httpJwt(authTokens.jwtMaryJane);

    showResponse(await admin.post("/users", { id: "john.smith" }));
    showResponse(await admin.post("/users", { id: "mary.jane" }));
    showResponse(await admin.get('/users'));
    showResponse(await admin.get('/users/john.smith'));
    showResponse(await maryJane.get('/users/me'));

    showResponse(await admin.post("/tokens", { to: { userId: "john.smith" }, amount: 500 }));
    showResponse(await admin.post("/tokens/transfer", { fromUserId: "john.smith", to: { userId: "mary.jane" }, amount: 400 }));
    showResponse(await admin.post("/tokens/transfer", { fromUserId: "john.smith", to: { address: "0x59240752f3Cb66Fb46AB5fdd1a9B0f5bfA17576d" }, amount: 40 }));
    showResponse(await admin.get("/tokens/history?userId=john.smith"));
    showResponse(await admin.get("/tokens/owned?userId=john.smith"));
    showResponse(await johnSmith.get("/tokens/history"));
    showResponse(await johnSmith.get("/tokens/owned"));

    showResponse(await admin.put(`/stakes/${stakeAddress}`));
    await catchResponse(() => admin.put(`/stakes/0x59240752f3Cb66Fb46AB5fdd1a9B0f5bfA17576d`));
    showResponse(await maryJane.post(`/stakes/${stakeAddress}/deposit`, { amount: 300 }));
    showResponse(await http.get(`/stakes/${stakeAddress}`));
    showResponse(await maryJane.get(`/stakes/${stakeAddress}/status`));

    const destinations = Array.from({ length: 35 }, _ => ({ address: ethers.Wallet.createRandom().address }));
    console.log(destinations);
    response = showResponse(await admin.post("/tokens/airdrop", { amount: 100, destinations }));
    const { requestId } = response.data;
    while (response.data.status != "Complete") {
        response = showResponse(await admin.get(`/tokens/airdrop/status/${requestId}`));
        await awaitSeconds(1);
    }

    await admin.put("/offers/template/1/", {
        name: "Discount Bet",
        description: "10% of next bet on horses",
        attributes: [{ "trait_type": "discount_percent", value: 10 }, { "trait_type": "valid", value: "horses" }]
    });
    await admin.put("/offers/template/1/3", {
        name: "Discount Bet",
        description: "5% of next bet on horses",
        attributes: [{ "trait_type": "discount_percent", value: 5 }, { "trait_type": "valid", value: "horses" }]
    });
    await admin.put("/offers/template/1/", {
        name: "Discount Bet",
        description: "10% of next bet on any sport",
        attributes: [{ "trait_type": "discount_percent", value: 10 }, { "trait_type": "valid", value: "sports" }]
    });
    showResponse(await http.get("/offers/0000000000000000000000000000000100000000000000000000000000000001"));
    showResponse(await http.get("/offers/0000000000000000000000000000000100000000000000000000000000000003"));
    await catchResponse(() => http.get("/offers/0000000000000000000000000000000400000000000000000000000000000001"));

    showResponse(await admin.post("/offers/1", { to: { userId: "john.smith" }, amount: 5 }));
    showResponse(await admin.post("/offers/3", { to: { address: "0x116B002A2593b9DD5a424ED81004A8F21BD6eEcd" }, amount: 0, additionalInfo: "Employee bonus" }));
    showResponse(await admin.post("/offers/1", { to: { userId: "mary.jane" }, amount: 0 }));
    showResponse(await admin.post("/offers/0x100000000000000000000000000000001/transfer", { fromUserId: "john.smith", to: { userId: "mary.jane" } }));
    showResponse(await maryJane.post("/offers/0x100000000000000000000000000000002/transfer", { to: { userId: "john.smith" } }));
    showResponse(await johnSmith.post("/offers/0x300000000000000000000000000000001/activate"));
    showResponse(await admin.get("/offers/owned?userId=john.smith"));
    showResponse(await admin.get("/offers/history?userId=john.smith"));
    showResponse(await johnSmith.get("/offers/owned"));
    showResponse(await johnSmith.get("/offers/history"));
    showResponse(await maryJane.get("/offers/owned"));
    showResponse(await maryJane.get("/offers/history"));

    await awaitSeconds(100);

    showResponse(await maryJane.post(`/stakes/${stakeAddress}/withdraw`));
    showResponse(await admin.get("/stakes/history?userId=mary.jane"));
    showResponse(await maryJane.get(`/stakes/history`));
};

run().then(() => console.log("Done...")).catch(err => console.error(err));
