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
    console.log(response);
};

run()
    .then(() => console.log("Done..."))
    .catch(err => console.log(err));
