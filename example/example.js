const axios = require("axios");

const authTokens = {
    jwtAdmin: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTEiLCJuYW1lIjoiVGVzdCIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.fsnCh3s0v8GGFBGhpLT5LClI0RAHCboOtI3YLLtFFmI"
};

const apiHost = "http://localhost:3005";

const run = async () => {
    const http = axios.create({
        baseURL: apiHost,
        headers: { Authorization: `Bearer ${authTokens.jwtAdmin}` },
    });

    let response = await http.post("/users", { id: "1001" });
    response = await http.post("/users", { id: "1003" });
    response = await http.post("/tokens/mint", { toUserId: "1003", amount: "500" });
    response = await http.post("/tokens/transfer", { fromUserId: "1003", toUserId: "1001", amount: "400" });
    response = await http.post("/tokens/transfer", { fromUserId: "1003", toAddress: "0x59240752f3Cb66Fb46AB5fdd1a9B0f5bfA17576d", amount: "40" });
    response = await http.get("/tokens/history/1003");
    console.log(response.data);
    response = await http.get("/tokens/balance/1003");
    console.log(response.data);
};

run().then(() => console.log("Done...")).catch(err => console.error(err));
