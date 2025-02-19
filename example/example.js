const fs = require("fs");
const axios = require("axios");
const ethers = require("ethers");

const authTokens = {
    jwtAdmin: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTEiLCJuYW1lIjoiVGVzdCIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.fsnCh3s0v8GGFBGhpLT5LClI0RAHCboOtI3YLLtFFmI"
};

const apiHost = "http://localhost:3005";

function awaitSeconds(seconds) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), seconds * 1000);
    });
}

const run = async () => {
    const http = axios.create({
        baseURL: apiHost,
        headers: { Authorization: `Bearer ${authTokens.jwtAdmin}` },
    });

    response = await http.put("/stakes/0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9");
    return; // !!

    response = await http.post("/users", { id: "1001" });
    response = await http.post("/users", { id: "1003" });
    response = await http.post("/tokens", { to: { userId: "1003" }, amount: "500" });
    response = await http.post("/tokens/transfer", { fromUserId: "1003", to: { userId: "1001" }, amount: "400" });
    response = await http.post("/tokens/transfer", { fromUserId: "1003", to: { address: "0x59240752f3Cb66Fb46AB5fdd1a9B0f5bfA17576d" }, amount: "40" });
    response = await http.get("/tokens/history?userId=1003");
    console.log(response.data);
    response = await http.get("/tokens/owned?userId=1003");
    console.log(response.data);

    const destinations = Array.from({ length: 35 }, _ => ({ address: ethers.Wallet.createRandom().address }));
    response = await http.post("/tokens/airdrop", { amount: "100", destinations });
    console.log(response.data);
    const { requestId } = response.data;
    for (let i = 0; i < 30; i++) {
        response = await http.get("/tokens/airdrop/status/" + requestId);
        console.log(response.data);
        await awaitSeconds(1);
    }

    response = await http.post("/offers/1", { to: { userId: "1003" }, amount: 0 });
    response = await http.put("/offers/template/1/3", {
        name: "Offer-1-3",
        description: "Description for specific instance",
        attributes: [{ "trait_type": "discount_percent", value: 5 }, { "trait_type": "valid", value: "horses" }]
    })
    response = await http.put("/offers/template/1", {
        name: "Offer-1",
        description: "Description for general type",
        attributes: [{ "trait_type": "discount_percent", value: 10 }, { "trait_type": "valid", value: "sports" }]
    })
};

run().then(() => console.log("Done...")).catch(err => console.error(err));
