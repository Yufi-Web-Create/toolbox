import { describe, expect, it } from "vitest";
import { isPublicIpv4, normalizeMailSettings } from "./security";

const valid={
  email:"info@example.jp",displayName:"店舗受付",
  username:"info@example.jp",password:"local-test-password",
  imapHost:"imap.example.jp",smtpHost:"smtp.example.jp",smtpPort:"465",
};
describe("IMAP SMTP secure configuration",()=>{
  it("permits valid TLS-only settings",()=>{
    expect(normalizeMailSettings(valid).smtpPort).toBe(465);
    expect(normalizeMailSettings({...valid,smtpPort:"587"}).smtpPort).toBe(587);
  });
  it("refuses arbitrary SMTP ports and incomplete TLS credentials",()=>{
    expect(()=>normalizeMailSettings({...valid,smtpPort:25})).toThrow();
    expect(()=>normalizeMailSettings({...valid,password:""})).toThrow();
    expect(()=>normalizeMailSettings({...valid,email:"not-email"})).toThrow();
  });
  it("refuses local and unqualified mail hosts",()=>{
    for(const host of ["localhost","127.0.0.1","host.local","imap.internal","foo","[::1]"]){
      expect(()=>normalizeMailSettings({...valid,imapHost:host})).toThrow();
    }
  });
  it("rejects private, loopback, link-local, documentation and IPv6 destinations",()=>{
    for(const address of ["127.0.0.1","10.0.0.5","192.168.0.1","172.16.0.2","100.64.0.1",
      "169.254.169.254","0.0.0.0","224.0.0.1","198.18.0.1","203.0.113.1","::1"]){
      expect(isPublicIpv4(address)).toBe(false);
    }
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
  });
});
