import { Controller, Get, INestApplication, Request, UseGuards } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import { Role } from "../src/auth/roles.types";
import { Roles } from "../src/auth/roles.decorator";
import { RolesGuard } from "../src/auth/roles.guard";

@Controller("test")
@UseGuards(RolesGuard)
export class TestController {
    constructor(
    ) { }

    @Get("unprotected")
    async unprotected(@Request() req) {
        return { userId: req.user?.id ?? "None" };
    }

    @Get("dual")
    @Roles(Role.Admin, Role.User)
    async dual(@Request() req) {
        return { userId: req.user.id, role: req.user.role };
    }

    @Get("useronly")
    @Roles(Role.User)
    async userOnly(@Request() req) {
        return { userId: req.user.id, role: req.user.role };
    }

    @Get("adminonly")
    @Roles(Role.Admin)
    async adminOnly(@Request() req) {
        return { userId: req.user.id, role: req.user.role };
    }
}

describe("Auth", () => {
    const jwtAdmin = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE4MDAwMDAwMDB9.NuWP4xuaXwd0khwyZvQznXRXTeCl3YguSEJ8u_2-9zs";
    const jwtUser = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJyb2xlIjoidXNlciIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxODAwMDAwMDAwfQ.f40mjwwV_zpnkS11eRiOZw40YWdaxBcEHWmanyBWtQo";

    let testModule: TestingModule;
    let app: INestApplication;
    let httpRequest;
    let userRequest;
    let adminRequest;

    beforeEach(async () => {
        testModule = await Test.createTestingModule({
            imports: [
                JwtModule.register({
                    global: true,
                    secret: "test",
                    verifyOptions: { ignoreExpiration: false }
                }),
            ],
            controllers: [TestController],
        }).compile();

        app = testModule.createNestApplication();
        await app.init();

        httpRequest = (path: string) => request(app.getHttpServer()).get(path);
        userRequest = (path: string) => httpRequest(path).set('Authorization', `Bearer ${jwtUser}`);
        adminRequest = (path: string) => httpRequest(path).set('Authorization', `Bearer ${jwtAdmin}`);
    });

    afterEach(async () => {
        await app?.close();
    });

    it("Should allow any on unprotected", async () => {
        return httpRequest('/test/unprotected').expect(200).expect({ userId: "None" });
    });

    it("Should allow user on unprotected", async () => {
        return userRequest('/test/unprotected').expect(200).expect({ userId: "None" });
    });

    it("Should allow admin on unprotected", async () => {
        return adminRequest('/test/unprotected').expect(200).expect({ userId: "None" });
    });

    it("Should not allow any on dual", async () => {
        return httpRequest('/test/dual').expect(401);
    });

    it("Should allow user on dual", async () => {
        return userRequest('/test/dual').expect(200).expect({ userId: "test-user", role: "user" });
    });

    it("Should allow admin on dual", async () => {
        return adminRequest('/test/dual').expect(200).expect({ userId: "test-admin", role: "admin" });
    });

    it("Should not allow any on user only", async () => {
        return httpRequest('/test/useronly').expect(401);
    });

    it("Should allow user on user only", async () => {
        return userRequest('/test/useronly').expect(200).expect({ userId: "test-user", role: "user" });
    });

    it("Should not allow admin on user only", async () => {
        return adminRequest('/test/useronly').expect(403);
    });

    it("Should not allow any on admin only", async () => {
        return httpRequest('/test/adminonly').expect(401);
    });

    it("Should not allow user on admin only", async () => {
        return userRequest('/test/adminonly').expect(403);
    });

    it("Should allow admin on admin only", async () => {
        return adminRequest('/test/adminonly').expect(200).expect({ userId: "test-admin", role: "admin" });
    });

    it("Should not allow JWT without issued at", async () => {
        const jwtNoIssuedAt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluIiwicm9sZSI6ImFkbWluIiwiZXhwIjoxODAwMDAwMDAwfQ.ZskQYBDEAwehRIuJVX7c-xDHI1AmguBbg-Rh5xpkYyY";
        return httpRequest('/test/adminonly').set('Authorization', `Bearer ${jwtNoIssuedAt}`).expect(401)
            .expect(res => expect(res.body.message).toBe('No issued at time in JWT'));
    });

    it("Should not allow issued JWT after current time", async () => {
        const jwtAfterIssuedAt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzkwMDAwMDAwLCJleHAiOjE4MDAwMDAwMDB9.5sOOn6SjmTNJaKvTn4oHX95mUQNUVRhJjsHoagK3dN4";
        return httpRequest('/test/adminonly').set('Authorization', `Bearer ${jwtAfterIssuedAt}`).expect(401)
            .expect(res => expect(res.body.message).toBe('Issued at is after current time'));
    });

    it("Should not allow JWT without expiry", async () => {
        const jwtNoExpiry = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyfQ.T2jObslvzn3dkxHkf-SdmNm766zdYV8iYY2XuVl7ziQ";
        return httpRequest('/test/adminonly').set('Authorization', `Bearer ${jwtNoExpiry}`).expect(401)
            .expect(res => expect(res.body.message).toBe('No expiry time in JWT'));
    });

    it("Should not allow expired JWT", async () => {
        const jwtExpired = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE2MDAwMDAwMDB9.29IPwnIsO3ncDc20PK2-m6rhhLHVdmkFehsQKDEHzYM";
        return httpRequest('/test/adminonly').set('Authorization', `Bearer ${jwtExpired}`).expect(401)
            .expect(res => expect(res.body.message).toBe('Invalid JWT: TokenExpiredError: jwt expired'));
    });

    it("Should not allow JWT signed with wrong secret", async () => {
        const jwtWrongSecret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE4MDAwMDAwMDB9.3n1odfeXurN1AN8g-0iXlCckAbZEp9rDfNNS6bKTCmI";
        return httpRequest('/test/adminonly').set('Authorization', `Bearer ${jwtWrongSecret}`).expect(401)
            .expect(res => expect(res.body.message).toBe('Invalid JWT: JsonWebTokenError: invalid signature'));
    });

    it("Should not allow corrupt JWT", async () => {
        const jwtCorrupt = "eyJhbGciOiJIUzI1NiI6IkpXVCJ9.eyJzdWjM5MDIyfQ.T2jObslvzn3dkxHkf-SdmNm766zdYV8iYY2X";
        return httpRequest('/test/adminonly').set('Authorization', `Bearer ${jwtCorrupt}`).expect(401)
            .expect(res => expect(res.body.message).toBe('Invalid JWT: JsonWebTokenError: invalid token'));
    });
});
