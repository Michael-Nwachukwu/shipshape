"use strict";var pt=Object.create;var J=Object.defineProperty;var ut=Object.getOwnPropertyDescriptor;var mt=Object.getOwnPropertyNames;var gt=Object.getPrototypeOf,ht=Object.prototype.hasOwnProperty;var ft=(s,e)=>{for(var t in e)J(s,t,{get:e[t],enumerable:!0})},xe=(s,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of mt(e))!ht.call(s,n)&&n!==t&&J(s,n,{get:()=>e[n],enumerable:!(o=ut(e,n))||o.enumerable});return s};var p=(s,e,t)=>(t=s!=null?pt(gt(s)):{},xe(e||!s||!s.__esModule?J(t,"default",{value:s,enumerable:!0}):t,s)),vt=s=>xe(J({},"__esModule",{value:!0}),s);var ls={};ft(ls,{activate:()=>cs,deactivate:()=>ds});module.exports=vt(ls);var w=p(require("vscode"));var Pe=p(require("os")),Ee=p(require("path")),N=p(require("vscode")),yt=Ee.join(Pe.homedir(),".config","locus","credentials.json");async function V(s){let e=await s.get("shipshape.buildApiKey");if(e)return{key:e,source:"secrets"};let t=await wt();if(t)return{key:t,source:"cli-credentials"}}async function wt(){try{let s=N.Uri.file(yt),e=await N.workspace.fs.readFile(s),t=JSON.parse(new TextDecoder().decode(e));return typeof t.api_key=="string"&&t.api_key.startsWith("claw_")?t.api_key:void 0}catch{return}}var pe="shipshape.geminiApiKey";async function X(s){return s.get(pe)}async function Te(s,e){let t=e?`${e} \u2014 paste a Gemini API key (free at aistudio.google.com/apikey)`:"Paste a Gemini API key (free at aistudio.google.com/apikey)",o=await N.window.showInputBox({prompt:t,password:!0,placeHolder:"AIza...",ignoreFocusOut:!0,validateInput:n=>n?n.length<20?"Key looks too short":null:"Required"});if(o)return await s.store(pe,o),o}async function Ce(s){await s.delete(pe)}var K="https://beta-api.buildwithlocus.com/v1",L=null,Le=["healthy","failed","cancelled","rolled_back"];function H(s){if(typeof s=="string")return s;if(s==null)return"";let e=s.message??s.log??s.text??s.line;if(typeof e=="string")return`${s.timestamp?`[${s.timestamp}] `:""}${e}`;try{return JSON.stringify(s)}catch{return String(s)}}var y=class extends Error{constructor(t,o,n,r,a){super(t);this.statusCode=o;this.details=n;this.creditBalance=r;this.requiredAmount=a;this.name="LocusError"}},Z=class{constructor(e){this.secrets=e}async getToken(){if(L)return L;let e=await V(this.secrets);if(!e)throw new y('No API key configured. Run "ShipShape: Configure Locus API Key" first.',401);return L=await this.exchangeApiKey(e.key),L}async exchangeApiKey(e){let t=await fetch(`${K}/auth/exchange`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:e})});if(!t.ok){let n=await t.json().catch(()=>({error:"Token exchange failed"}));throw new y(n.error??"Token exchange failed",t.status)}return(await t.json()).token}async verifyOrRefreshToken(){let e=await this.getToken();try{return await this._request("GET","/auth/whoami",void 0,e),e}catch(t){if(!(t instanceof y)||t.statusCode!==401)throw t;try{let n=await fetch(`${K}/auth/refresh`,{method:"POST",headers:{Authorization:`Bearer ${e}`}});if(n.ok)return L=(await n.json()).token,L}catch{}L=null;let o=await V(this.secrets);if(!o)throw new y("Session expired. Please re-enter your API key.",401);return L=await this.exchangeApiKey(o.key),L}}clearTokenCache(){L=null}async _request(e,t,o,n){let r=n??await this.getToken(),a=await fetch(`${K}${t}`,{method:e,headers:{Authorization:`Bearer ${r}`,...o!==void 0?{"Content-Type":"application/json"}:{}},body:o!==void 0?JSON.stringify(o):void 0});if(a.status===204)return;let c=await a.json().catch(()=>({}));if(!a.ok)throw new y(c.error??`${e} ${t} failed (${a.status})`,a.status,c.details,c.creditBalance,c.requiredAmount);return c}async whoami(){return this._request("GET","/auth/whoami")}async getBillingBalance(){return this._request("GET","/billing/balance")}async createProject(e,t,o){return this._request("POST","/projects",{name:e,region:t,description:o})}async listProjects(){return(await this._request("GET","/projects")).projects}async getProject(e){return this._request("GET",`/projects/${e}`)}async fromRepo(e,t="main",o,n){return this._request("POST","/projects/from-repo",{repo:e,branch:t,name:o,region:n})}async verifyLocusbuild(e){return this._request("POST","/projects/verify-locusbuild",{locusbuild:e})}async createEnvironment(e,t,o){return this._request("POST",`/projects/${e}/environments`,{name:t,type:o})}async listEnvironments(e){return(await this._request("GET",`/projects/${e}/environments`)).environments}async createService(e){return this._request("POST","/services",{...e,runtime:e.runtime??{port:8080}})}async getService(e,t=!1){let o=t?"?include=runtime":"";return this._request("GET",`/services/${e}${o}`)}async listServices(e){return(await this._request("GET",`/services/environment/${e}`)).services}async updateService(e,t){return this._request("PATCH",`/services/${e}`,t)}async restartService(e){return this._request("POST",`/services/${e}/restart`)}async redeployService(e){return this._request("POST",`/services/${e}/redeploy`)}async deleteService(e){return this._request("DELETE",`/services/${e}`)}async triggerDeployment(e){return this._request("POST","/deployments",{serviceId:e})}async getDeployment(e){return this._request("GET",`/deployments/${e}`)}async listDeployments(e,t=10){return(await this._request("GET",`/deployments/service/${e}?limit=${t}`)).deployments}async cancelDeployment(e){return this._request("POST",`/deployments/${e}/cancel`)}async rollbackDeployment(e,t){return this._request("POST",`/deployments/${e}/rollback`,{reason:t})}async setVariables(e,t){return this._request("PUT",`/variables/service/${e}`,{variables:t})}async mergeVariables(e,t){return this._request("PATCH",`/variables/service/${e}`,{variables:t})}async getResolvedVariables(e){return(await this._request("GET",`/variables/service/${e}/resolved`)).variables}async createAddon(e,t,o,n){return this._request("POST","/addons",{projectId:e,environmentId:t,type:o,name:n})}async getAddon(e){return this._request("GET",`/addons/${e}`)}async listAddons(e){return(await this._request("GET",`/addons/environment/${e}`)).addons??[]}async deleteAddon(e){return this._request("DELETE",`/addons/${e}`)}async getDeploymentLogs(e){return this._request("GET",`/deployments/${e}/logs`)}async streamDeploymentLogs(e,t,o){let n=await this.getToken(),r=await fetch(`${K}/deployments/${e}/logs?follow=true`,{headers:{Authorization:`Bearer ${n}`},signal:o});r.body&&await this._consumeSseStream(r.body,t)}async streamServiceLogs(e,t,o){let n=await this.getToken(),r=await fetch(`${K}/services/${e}/logs?follow=true`,{headers:{Authorization:`Bearer ${n}`},signal:o});r.body&&await this._consumeSseStream(r.body,t)}async _consumeSseStream(e,t){let o=e.getReader(),n=new TextDecoder;try{for(;;){let{done:r,value:a}=await o.read();if(r)break;let c=n.decode(a,{stream:!0});for(let l of c.split(`
`))l.startsWith("data:")&&t(l.replace(/^data:\s?/,""))}}finally{o.releaseLock()}}async checkRepoAccess(e){return this._request("GET",`/github/repo-access?repo=${encodeURIComponent(e)}`)}async getGitRemoteUrl(){return this._request("GET","/git/remote-url")}async createWebhook(e,t,o){return this._request("POST","/webhooks",{projectId:e,url:t,events:o})}async deleteWebhook(e){return this._request("DELETE",`/webhooks/${e}`)}};var U=p(require("vscode")),bt={idle:{text:"$(shipshape-logo) ShipShape",tooltip:"Click to deploy"},detecting:{text:"$(search) ShipShape: Detecting...",tooltip:"Detecting project type"},building:{text:"$(tools) ShipShape: Building...",tooltip:"Building Docker image (2-4 min)"},deploying:{text:"$(sync~spin) ShipShape: Deploying...",tooltip:"Starting container (1-3 min)"},healthy:{text:"$(check) ShipShape: Live",tooltip:"Click to open live URL"},failed:{text:"$(error) ShipShape: Failed",tooltip:"Click to view logs"}},x;function $e(){return x=U.window.createStatusBarItem(U.StatusBarAlignment.Left,100),u("idle"),x.show(),x}function u(s,e){if(!x)return;let t=bt[s];x.text=t.text,s==="healthy"&&e?(x.tooltip=`Live at ${e} \u2014 Click to open in browser`,x.command={command:"vscode.open",arguments:[U.Uri.parse(e)],title:"Open in Browser"}):s==="failed"?(x.tooltip=t.tooltip,x.command="shipshape.viewLogs"):(x.tooltip=t.tooltip,x.command="shipshape.deploy")}function ue(){x?.dispose(),x=void 0}var i=p(require("vscode"));var R=p(require("vscode"));function St(s,e){let t=e?`${e}: `:"";if(s instanceof y)switch(s.statusCode){case 401:return{message:`${t}Authentication failed. Your API key may be invalid or expired.`,actions:[{label:"Re-enter API Key"}]};case 402:{let o=s.creditBalance!==void 0?`$${s.creditBalance}`:"unknown",n=s.requiredAmount!==void 0?`$${s.requiredAmount}`:"$0.25";return{message:`${t}Insufficient credits (balance: ${o}, need: ${n}).`,actions:[{label:"Add Credits",url:"https://beta.buildwithlocus.com/billing"}]}}case 404:return{message:`${t}Resource not found \u2014 it may have been deleted or never existed.`};case 409:return{message:`${t}Conflict \u2014 ${s.message}${s.details?` (${s.details})`:""}`};case 429:return{message:`${t}Rate limited by Locus API. Wait a moment and try again.`};case 500:case 502:case 503:case 504:return{message:`${t}Locus API is having issues (HTTP ${s.statusCode}). Try again in a minute.`};default:return{message:`${t}${s.message}${s.details?` \u2014 ${s.details}`:""}`}}return s instanceof Error?s.name==="AbortError"?{message:`${t}Request cancelled.`}:/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(s.message)?{message:`${t}Network error \u2014 check your internet connection and try again.`}:{message:`${t}${s.message}`}:{message:`${t}Unknown error \u2014 ${String(s)}`}}async function j(s,e){let{message:t,actions:o}=St(s,e),n=(o??[]).map(c=>c.label),r=await R.window.showErrorMessage(`ShipShape: ${t}`,...n);if(!r)return;let a=(o??[]).find(c=>c.label===r);a?.url?R.env.openExternal(R.Uri.parse(a.url)):a?.label==="Re-enter API Key"&&R.commands.executeCommand("shipshape.openSettings")}var A=p(require("vscode")),me=p(require("path")),F={nextjs:"Next.js","react-vite":"React + Vite",express:"Express (Node.js)",fastapi:"FastAPI (Python)",django:"Django (Python)",rails:"Ruby on Rails","generic-node":"Generic Node.js","generic-python":"Generic Python",dockerfile:"Dockerfile (custom)",unknown:"Unknown"};async function De(s){if(await xt(s,"Dockerfile"))return"dockerfile";let e=await Pt(s,"package.json");if(e){let r={...e.dependencies??{},...e.devDependencies??{}};return"next"in r?"nextjs":"react"in r&&"vite"in r?"react-vite":"express"in r?"express":"generic-node"}let t=await Q(s,"requirements.txt");if(t!==null){let r=t.toLowerCase();return/\bfastapi\b/.test(r)?"fastapi":/\bdjango\b/.test(r)?"django":"generic-python"}let o=await Q(s,"pyproject.toml");if(o!==null){let r=o.toLowerCase();return/fastapi/.test(r)?"fastapi":/django/.test(r)?"django":"generic-python"}let n=await Q(s,"Gemfile");return n!==null&&/\brails\b/i.test(n)?"rails":"unknown"}async function xt(s,e){try{let t=A.Uri.file(me.join(s.fsPath,e));return(await A.workspace.fs.stat(t)).type===A.FileType.File}catch{return!1}}async function Q(s,e){try{let t=A.Uri.file(me.join(s.fsPath,e)),o=await A.workspace.fs.readFile(t);return new TextDecoder().decode(o)}catch{return null}}async function Pt(s,e){let t=await Q(s,e);if(t===null)return null;try{return JSON.parse(t)}catch{return null}}var ee=p(require("vscode")),Ie=p(require("path"));var Et="gemini-2.5-flash",Tt="https://generativelanguage.googleapis.com/v1beta/models",P=class extends Error{constructor(t,o,n){super(t);this.statusCode=o;this.body=n;this.name="GeminiError"}},Ct=new Set([429,500,502,503,504]),ge=2,Lt=1500;async function Re(s,e){let t=e.model??Et,o=`${Tt}/${encodeURIComponent(t)}:generateContent`,n={systemInstruction:{parts:[{text:e.system}]},contents:[{role:"user",parts:[{text:e.userMessage}]}],generationConfig:{temperature:.2,maxOutputTokens:e.maxTokens??4e3,...e.jsonMode?{responseMimeType:"application/json"}:{},...e.responseSchema?{responseSchema:e.responseSchema}:{}}},r,a;for(let g=0;g<=ge;g++){try{if(r=await fetch(o,{method:"POST",headers:{"x-goog-api-key":s,"Content-Type":"application/json"},body:JSON.stringify(n)}),r.ok||!Ct.has(r.status)||g===ge)break}catch(m){if(a=m,g===ge)throw m}await new Promise(m=>setTimeout(m,Lt*2**g))}if(!r)throw new P(`Gemini network error: ${a?.message??"unknown"}`,0);if(!r.ok){let g;try{g=await r.json()}catch{}throw new P(`Gemini API returned ${r.status}`,r.status,g)}let c=await r.json();if(c.error)throw new P(c.error.message,c.error.code||500,c.error);if(c.promptFeedback?.blockReason)throw new P(`Gemini blocked the prompt: ${c.promptFeedback.blockReason}`,400,c.promptFeedback);let l=c.candidates?.[0],b=l?.content?.parts?.[0]?.text;if(!b)throw new P("Empty response from Gemini",500,c);if(l?.finishReason==="MAX_TOKENS")throw new P("Gemini response was truncated (hit max output tokens). Increase maxTokens or simplify the request.",500,{finishReason:l.finishReason,rawLength:b.length});return b}function Ae(s){let e=s.trim(),t=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);return t&&(e=t[1].trim()),JSON.parse(e)}var $t=`You are an expert deployment failure diagnostician for the Locus PaaS.
You will receive the failure phase, the tail of the build/runtime logs, and the project's current state (relevant files).

Your job: identify the ROOT CAUSE and, when safe, propose a concrete file-level fix.

Context about Locus:
- Containers MUST listen on port 8080 (platform injects PORT=8080)
- Base images are pulled from Locus's ECR mirror of Docker Hub (only "library/*" images, subset available \u2014 node:20-alpine works, caddy:2-alpine does NOT)
- Images MUST be linux/arm64
- \`.locusbuild\` uses Nixpacks auto-detection; does NOT support buildConfig \u2014 that only works on direct POST /v1/services
- Health checks: Locus proxies to the service at the configured healthCheck path on 8080 shortly after start

Output a single JSON object matching this schema EXACTLY. No prose, no markdown fences, no explanation.

{
  "summary": "one-sentence headline of what went wrong",
  "rootCause": "2-4 sentences explaining the actual cause, citing specific log lines if relevant",
  "owner": "user" | "platform" | "config" | "unknown",
  "confidence": "high" | "medium" | "low",
  "fix": null | {
    "description": "short label for the change",
    "file": "path/relative/to/workspace/root",
    "action": "replace",
    "content": "FULL new file content (we overwrite the existing file)",
    "commitMessage": "git commit message"
  }
}

Rules for proposing a fix:
- Only propose a fix when confidence is "high" and the change is SAFE and MINIMAL.
- "file" must be the path of an existing file in the workspace (Dockerfile, package.json, .locusbuild, etc.), relative to repo root.
- "content" must be the COMPLETE new file contents. The extension does a full replace, not a patch.
- If the fix would require changes to multiple files, or would delete/add files, set "fix": null and explain in rootCause.
- Prefer the smallest viable change. Don't refactor. Don't add comments. Don't change anything unrelated to the fix.
- If the failure is platform-side (owner: "platform"), set fix: null \u2014 user can't fix it, only retry.`;function Dt(s,e){let t=s.logs.slice(-200).join(`
`),o=e.length>0?e.map(n=>`
===== FILE: ${n.path} =====
${n.content}`).join(`
`):`
(no project files attached)`;return`Deployment failed.

Phase at failure: ${s.phase}
Project type: ${F[s.projectType]} (${s.projectType})
Repo: ${s.repoSlug}

---- LAST ${Math.min(s.logs.length,200)} LOG LINES ----
${t}

---- PROJECT FILES ----${o}`}async function Rt(s){let e=["Dockerfile",".locusbuild","package.json","requirements.txt","pyproject.toml","Gemfile","nixpacks.toml"],t=[];for(let n of e)try{let r=ee.Uri.file(Ie.join(s.fsPath,n)),a=await ee.workspace.fs.readFile(r),c=new TextDecoder().decode(a);c.length>8e3&&(c=c.slice(0,8e3)+`
... [truncated, file is ${a.byteLength} bytes total]`),t.push({path:n,content:c})}catch{}return t}var At={type:"OBJECT",properties:{summary:{type:"STRING"},rootCause:{type:"STRING"},owner:{type:"STRING",enum:["user","platform","config","unknown"]},confidence:{type:"STRING",enum:["high","medium","low"]},fix:{type:"OBJECT",nullable:!0,properties:{description:{type:"STRING"},file:{type:"STRING"},action:{type:"STRING",enum:["replace"]},content:{type:"STRING"},commitMessage:{type:"STRING"}},required:["description","file","action","content","commitMessage"]}},required:["summary","rootCause","owner","confidence","fix"]};async function Be(s,e){let t=await Rt(e.workspaceRoot),o=Dt(e,t),n=await Re(s,{system:$t,userMessage:o,maxTokens:8e3,jsonMode:!0,responseSchema:At}),r;try{r=Ae(n)}catch(a){throw new P(`Gemini returned malformed JSON: ${a.message}. Raw response (first 300 chars): ${n.slice(0,300)}`,500,{raw:n.slice(0,1e3)})}if(typeof r.summary!="string"||typeof r.rootCause!="string")throw new P("Diagnosis JSON missing required fields",500,r);return r}var Ze=p(require("path"));var I=p(require("vscode")),he=p(require("path")),It=/github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/;async function je(s){try{let e=I.Uri.file(he.join(s.fsPath,".git","config")),t=await I.workspace.fs.readFile(e),o=new TextDecoder().decode(t);return Bt(o)}catch{return}}function Bt(s){for(let e of s.split(`
`)){let t=e.trim();if(!t.startsWith("url ="))continue;let n=t.replace(/^url\s*=\s*/,"").trim().match(It);if(n)return n[1]}}async function Me(s){try{let e=I.Uri.file(he.join(s.fsPath,".git"));return(await I.workspace.fs.stat(e)).type===I.FileType.Directory}catch{return!1}}var G=p(require("vscode")),_e=p(require("path")),jt={nextjs:{services:{web:{path:".",port:8080,healthCheck:"/"}}},"react-vite":{services:{web:{path:".",port:8080,healthCheck:"/"}}},express:{services:{api:{path:".",port:8080,healthCheck:"/"}}},fastapi:{services:{api:{path:".",port:8080,healthCheck:"/health"}}},django:{services:{api:{path:".",port:8080,healthCheck:"/"}}},rails:{services:{api:{path:".",port:8080,healthCheck:"/"}}},dockerfile:{services:{web:{path:".",port:8080,healthCheck:"/"}}},"generic-node":{services:{web:{path:".",port:8080,healthCheck:"/"}}},"generic-python":{services:{api:{path:".",port:8080,healthCheck:"/"}}},unknown:null};function Oe(s){return jt[s]}async function fe(s){return G.Uri.file(_e.join(s.fsPath,".locusbuild"))}async function ve(s){try{let e=await fe(s),t=await G.workspace.fs.readFile(e),o=new TextDecoder().decode(t);return JSON.parse(o)}catch{return null}}async function Ne(s,e){let t=await fe(s),o=new TextEncoder().encode(JSON.stringify(e,null,2)+`
`);return await G.workspace.fs.writeFile(t,o),t}async function Ue(s){try{let e=await fe(s);return await G.workspace.fs.stat(e),!0}catch{return!1}}var W=p(require("vscode")),Fe=p(require("path")),Mt=new Set(["react-vite"]);function Ge(s){return Mt.has(s)}var _t={"react-vite":`# Auto-generated by ShipShape.
# Builds a Vite/React static site and serves it on port 8080.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
`};function qe(s){return _t[s]}function te(s){return W.Uri.file(Fe.join(s.fsPath,"Dockerfile"))}async function Ve(s){try{return await W.workspace.fs.stat(te(s)),!0}catch{return!1}}async function Ke(s,e){let t=te(s);return await W.workspace.fs.writeFile(t,new TextEncoder().encode(e)),t}var He=p(require("vscode"));async function Ot(){let s=He.extensions.getExtension("vscode.git");return s?(s.isActive?s.exports:await s.activate()).getAPI(1):void 0}async function Nt(s){let e=await Ot();if(e)return e.repositories.find(t=>t.rootUri.fsPath===s.fsPath)}async function ye(s,e){let t=await Nt(s);if(!t)return{ok:!1,reason:"No git repository detected in this workspace."};try{await t.add([e.filePath]),await t.commit(e.commitMessage)}catch(r){return{ok:!1,reason:`git commit failed: ${r.message}`}}let o=t.state.HEAD?.name,n=!!t.state.HEAD?.upstream;try{if(n)await t.push();else if(o)await t.push("origin",o,!0);else return{ok:!1,reason:"Commit created, but could not push \u2014 branch has no name."}}catch(r){return{ok:!1,reason:`git push failed: ${r.message}`}}return{ok:!0}}var We=p(require("vscode")),se=class{constructor(e){this._client=e;this._channels=new Map}getOrCreateChannel(e){let t=this._channels.get(e);if(t)return t;let o=We.window.createOutputChannel(`ShipShape: ${e}`);return this._channels.set(e,o),o}disposeChannel(e){this._channels.get(e)?.dispose(),this._channels.delete(e)}disposeAll(){for(let e of this._channels.values())e.dispose();this._channels.clear()}async streamDeploymentLogs(e,t,o){await this._client.streamDeploymentLogs(e,n=>{n.trim()&&t.appendLine(n)},o)}async streamServiceLogs(e,t,o){await this._client.streamServiceLogs(e,n=>{n.trim()&&t.appendLine(n)},o)}};var Ut=6e4,Ye=15*6e4,oe=6e4,Qe=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,Ft=/github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;function ze(s){let e=s.trim();if(Qe.test(e))return e;let t=e.match(Ft);return t?t[1]:void 0}function et(s,e){let t=new se(e);s.subscriptions.push(i.commands.registerCommand("shipshape.deploy",async()=>{try{await Gt(s,e,t)}catch(o){ss(o),u("failed")}})),s.subscriptions.push({dispose:()=>t.disposeAll()})}async function Gt(s,e,t){if(!await qt(s,e))return;await i.window.withProgress({location:i.ProgressLocation.Notification,title:"ShipShape: Verifying credentials..."},async()=>{await e.verifyOrRefreshToken()});let n=await e.getBillingBalance();if(n.creditBalance<.25){await i.window.showErrorMessage(`Insufficient Locus credits ($${n.creditBalance.toFixed(2)}). Each service costs $0.25/month.`,"Add Credits")==="Add Credits"&&i.env.openExternal(i.Uri.parse("https://beta.buildwithlocus.com/billing"));return}if(n.warnings&&n.warnings.length>0)for(let h of n.warnings)i.window.showWarningMessage(`ShipShape: ${h.message}`);let r=os();if(!r){i.window.showErrorMessage("Open a folder first \u2014 deploy needs a workspace.");return}u("detecting");let a=await De(r),c=await Vt(a);if(!c){u("idle");return}if(!await Kt(r,c)){u("idle");return}if(!await Ue(r)){let h=Oe(c);if(!h){i.window.showErrorMessage("Could not auto-generate a .locusbuild for this project. Create one manually and retry."),u("idle");return}let D=await Ne(r,h),Y=await i.workspace.openTextDocument(D);if(await i.window.showTextDocument(Y,{preview:!1}),await i.window.showInformationMessage("Generated .locusbuild \u2014 review it, then deploy.",{modal:!1},"Deploy","Cancel")!=="Deploy"){u("idle");return}}let g=await ve(r);if(g)try{let h=await e.verifyLocusbuild(g);if(!h.valid){i.window.showErrorMessage(`Invalid .locusbuild: ${h.errors.join("; ")}`),u("idle");return}}catch(h){console.warn("verify-locusbuild failed, continuing:",h)}let m=await Ht(r);if(!m){u("idle");return}let k,v=(await e.listProjects()).find(h=>h.name===m.split("/")[1]||h.name===m);if(v){let D=(await e.listEnvironments(v.id))[0];if(!D){i.window.showErrorMessage("Project exists but has no environments. Clean it up in the dashboard."),u("idle");return}let Y=await e.listServices(D.id),z=Y[0];if(!z)k=await Je(e,m);else{await Wt(e,r,Y);let lt=await e.triggerDeployment(z.id);k={project:v,environment:D,services:[z],deployments:[lt]},i.window.showInformationMessage(`Redeploying existing project "${v.name}"...`)}}else k=await Je(e,m);let E=k.services[0],q=k.deployments[0];if(!E||!q){i.window.showErrorMessage("Deployment kicked off but response was malformed."),u("failed");return}let ke={projectId:k.project.id,environmentId:k.environment.id,serviceId:E.id,serviceName:E.name,serviceUrl:E.url,deploymentId:q.id,repoSlug:m};await s.globalState.update("shipshape.lastDeploy",ke);let f=t.getOrCreateChannel(m);f.show(!0),f.appendLine(`\u{1F680} Deployment started \u2014 ${new Date().toISOString()}`),f.appendLine(`   Project:    ${k.project.name} (${k.project.id})`),f.appendLine(`   Service:    ${E.name} (${E.id})`),f.appendLine(`   Deployment: ${q.id}`),f.appendLine(`   Repo:       ${m}`),f.appendLine(""),u("building");let le=new AbortController,Se=t.streamDeploymentLogs(q.id,f,le.signal).catch(h=>{h?.name!=="AbortError"&&f.appendLine(`\u26A0 Log stream disconnected: ${h?.message??h}`)});try{let h=await tt(e,q.id,f);if(h.status==="healthy"){f.appendLine(""),f.appendLine(`\u2705 Deployment healthy. Waiting ${oe/1e3}s for service discovery...`),u("deploying"),await we(oe),f.appendLine(`\u{1F310} Live at: ${E.url}`),u("healthy",E.url),i.commands.executeCommand("shipshape.refreshServices");let D=await i.window.showInformationMessage(`ShipShape: ${E.name} is live at ${E.url}`,"Open in Browser","View Logs");D==="Open in Browser"?i.env.openExternal(i.Uri.parse(E.url)):D==="View Logs"&&f.show()}else h.status==="failed"?(f.appendLine(""),f.appendLine("\u274C Deployment failed."),le.abort(),await Se,await st({context:s,client:e,logProvider:t,channel:f,state:ke,projectType:c,workspaceRoot:r})):(f.appendLine(""),f.appendLine(`\u26A0 Deployment ended with status: ${h.status}`),u("idle"))}finally{le.abort(),await Se}}async function qt(s,e){let t=await V(s.secrets);if(t)return t.key;let o=await i.window.showInputBox({prompt:"Enter your Locus Build API key",password:!0,placeHolder:"claw_...",ignoreFocusOut:!0,validateInput:n=>n&&!n.startsWith("claw_")?"Key must start with claw_":null});if(o)return await s.secrets.store("shipshape.buildApiKey",o),e.clearTokenCache(),o}async function Vt(s){let e=F[s];s==="unknown"&&i.window.showWarningMessage("Could not auto-detect a framework. Pick one, or cancel and add a Dockerfile/.locusbuild manually.");let t=[{label:`$(check) Use detected: ${e}`,description:s,detail:"Generate a .locusbuild based on this detection"},{label:"",kind:i.QuickPickItemKind.Separator},...Object.entries(F).filter(([n])=>n!==s&&n!=="unknown").map(([n,r])=>({label:r,description:n})),{label:"$(close) Cancel",description:"cancel"}],o=await i.window.showQuickPick(t,{title:"ShipShape: Confirm project type",placeHolder:`Detected: ${e}`,ignoreFocusOut:!0});if(!(!o||o.description==="cancel"))return o.description===s||o.label.startsWith("$(check)")?s==="unknown"?void 0:s:o.description}async function Kt(s,e){if(!Ge(e)||await Ve(s))return!0;let t=qe(e);if(!t)return!0;let o=F[e],n=await i.window.showWarningMessage(`ShipShape: ${o} projects need a Dockerfile to bind to port 8080. Nixpacks' default serves on port 80 and will fail health checks. Generate one now?`,{modal:!0},"Generate Dockerfile","Deploy anyway");if(n==="Deploy anyway")return i.window.showWarningMessage("Proceeding without a Dockerfile. Deployment is likely to fail at runtime health check."),!0;if(n!=="Generate Dockerfile")return!1;let r=await Ke(s,t),a=await i.workspace.openTextDocument(r);await i.window.showTextDocument(a,{preview:!1});let c=await i.window.showInformationMessage("Dockerfile written. Locus builds from GitHub, so we need to commit + push before deploying.",{modal:!0},"Commit & push","I'll commit manually","Cancel");if(c==="Cancel"||!c)return!1;if(c==="I'll commit manually")return i.window.showInformationMessage('Commit the Dockerfile and push to your default branch, then run "ShipShape: Deploy Workspace" again.'),!1;let l=await i.window.withProgress({location:i.ProgressLocation.Notification,title:"ShipShape: Committing Dockerfile..."},async()=>ye(s,{filePath:te(s).fsPath,commitMessage:"Add Dockerfile for Locus deploy (port 8080)"}));if(!l.ok){if(await i.window.showErrorMessage(`Could not commit + push automatically: ${l.reason}`,"Open terminal","Cancel")==="Open terminal"){let g=i.window.createTerminal("ShipShape");g.show(),g.sendText('git add Dockerfile && git commit -m "Add Dockerfile for Locus deploy" && git push')}return!1}return i.window.showInformationMessage("Dockerfile committed and pushed. Continuing deploy..."),!0}async function Ht(s){let e=i.workspace.getConfiguration("shipshape"),t=e.get("githubRepo");if(t&&Qe.test(t))return t;let o=await je(s);if(o){let a=await i.window.showInformationMessage(`ShipShape: Deploy from GitHub repo "${o}"?`,{modal:!1},"Yes","Use a different repo");if(a==="Yes")return await e.update("githubRepo",o,i.ConfigurationTarget.Workspace),o;if(!a)return}else if(!await Me(s)){if(await i.window.showWarningMessage("This folder has no git repository. Push your code to GitHub first, then deploy.","Enter repo manually")!=="Enter repo manually")return}else if(await i.window.showWarningMessage('No GitHub remote found. Add one with "git remote add origin https://github.com/owner/repo" and push, or enter the repo manually.',"Enter repo manually")!=="Enter repo manually")return;let n=await i.window.showInputBox({prompt:"GitHub repo \u2014 paste the URL or enter owner/repo",placeHolder:"e.g. https://github.com/owner/repo  or  owner/repo",ignoreFocusOut:!0,validateInput:a=>a?ze(a)?null:"Could not parse a GitHub repo from that input":"Required"});if(!n)return;let r=ze(n);return await e.update("githubRepo",r,i.ConfigurationTarget.Workspace),r}async function Je(s,e){return i.window.withProgress({location:i.ProgressLocation.Notification,title:`ShipShape: Creating project from ${e}...`},async()=>{let t=i.workspace.getConfiguration("shipshape").get("defaultRegion")??"us-east-1",o=e.split("/")[1];return s.fromRepo(e,"main",o,t)})}async function Wt(s,e,t){let o=await ve(e);if(o?.services)for(let[n,r]of Object.entries(o.services)){let a=t.find(l=>l.name===n);if(!a)continue;let c=r.healthCheck;if(c)try{await s.updateService(a.id,{healthCheckPath:c}),i.window.showInformationMessage(`Synced healthCheck for "${n}": ${c}`)}catch(l){console.warn(`Failed to sync healthCheck for ${n}:`,l)}}}async function tt(s,e,t){let o=Date.now(),n=null;for(;;){if(Date.now()-o>Ye)throw t.appendLine(`\u26A0 Polling timed out after ${Ye/6e4} minutes.`),new Error("Deployment polling timeout");let r=await s.getDeployment(e);if(r.status!==n&&(t.appendLine(`[${new Date().toISOString()}] Status: ${r.status}`),Yt(r.status),n=r.status),Le.includes(r.status))return r;await we(Ut)}}function Yt(s){switch(s){case"queued":case"building":u("building");break;case"deploying":u("deploying");break;case"healthy":break;case"failed":case"cancelled":case"rolled_back":u("failed");break}}async function zt(s,e,t){t.appendLine(""),t.appendLine("\u2500\u2500\u2500 Fetching full deployment logs \u2500\u2500\u2500");let o=[],n="unknown";try{let r=await s.getDeploymentLogs(e),a=r.logs??[];n=r.phase??"unknown",r.reason&&t.appendLine(`Reason: ${r.reason}`),t.appendLine(`Phase at failure: ${n}`),t.appendLine(`Total log lines: ${a.length}`),t.appendLine(""),o=a.map(H);let c=o.slice(-100);for(let l of c)t.appendLine(l)}catch(r){t.appendLine(`\u26A0 Could not fetch full logs: ${r.message}`);try{let a=await s.getDeployment(e);if(a.lastLogs){o=a.lastLogs.map(H);for(let c of o)t.appendLine(c)}}catch{}}return{phase:n,renderedLines:o}}async function st(s){let{context:e,client:t,channel:o,state:n,projectType:r,workspaceRoot:a}=s,{phase:c,renderedLines:l}=await zt(t,n.deploymentId,o);u("failed");let b=await X(e.secrets);if(b)try{o.appendLine(""),o.appendLine("\u{1F916} Running AI diagnosis (Gemini 2.5 Flash)...");let m=await i.window.withProgress({location:i.ProgressLocation.Notification,title:"ShipShape: AI diagnosing failure..."},()=>Be(b,{phase:c,logs:l,projectType:r,workspaceRoot:a,repoSlug:n.repoSlug}));await Xt(m,s);return}catch(m){let k=m instanceof P?`AI diagnosis failed (HTTP ${m.statusCode}): ${m.message}`:`AI diagnosis failed: ${m.message}`;o.appendLine(`\u26A0 ${k}`),o.appendLine("   Falling back to pattern-based diagnosis.")}else Jt();let g=ts(l,c);await es(g,o)}function Jt(){i.window.showInformationMessage("Tip: Add a free Gemini API key to get AI-powered failure diagnosis and auto-fix.","Configure","Get a free key").then(s=>{s==="Configure"?i.commands.executeCommand("shipshape.configureAiApiKey"):s==="Get a free key"&&i.env.openExternal(i.Uri.parse("https://aistudio.google.com/apikey"))})}async function Xt(s,e){let{channel:t}=e;t.appendLine(""),t.appendLine(`\u{1F916} AI Diagnosis (${s.confidence} confidence \xB7 owner: ${s.owner})`),t.appendLine(`   ${s.summary}`),t.appendLine("");for(let r of s.rootCause.split(`
`))t.appendLine(`   ${r}`);s.fix?(t.appendLine(""),t.appendLine(`   \u{1F4A1} Proposed fix: ${s.fix.description}`),t.appendLine(`      File: ${s.fix.file}`)):(t.appendLine(""),t.appendLine("   \u2139  No safe auto-fix available \u2014 this issue needs a manual change"),t.appendLine("      (renames, multi-file changes, and low-confidence fixes are skipped for safety)."));let o=[];s.fix?o.push("Apply & redeploy","Preview fix","View logs"):(o.push("View logs"),(s.owner==="user"||s.owner==="config")&&o.push("Retry"));let n=await i.window.showErrorMessage(s.summary,...o);n==="Apply & redeploy"&&s.fix?await Xe(s.fix,e):n==="Preview fix"&&s.fix?(await Zt(s.fix),await i.window.showInformationMessage("Apply this fix, commit, push, and redeploy?",{modal:!0},"Apply & redeploy","Cancel")==="Apply & redeploy"&&await Xe(s.fix,e)):n==="View logs"?t.show():n==="Retry"&&i.commands.executeCommand("shipshape.deploy")}async function Zt(s){let e=Qt(s.file),t=await i.workspace.openTextDocument({content:s.content,language:e});await i.window.showTextDocument(t,{preview:!0})}function Qt(s){if(/\.json$/.test(s)||s===".locusbuild")return"json";if(/Dockerfile$/.test(s))return"dockerfile";if(/\.(ts|tsx)$/.test(s))return"typescript";if(/\.(js|jsx|mjs|cjs)$/.test(s))return"javascript";if(/\.ya?ml$/.test(s))return"yaml";if(/\.toml$/.test(s))return"toml"}async function Xe(s,e){let{context:t,client:o,logProvider:n,channel:r,state:a,workspaceRoot:c}=e,l=i.Uri.file(Ze.join(c.fsPath,s.file));r.appendLine(""),r.appendLine(`\u{1F527} Applying fix: ${s.description}`),r.appendLine(`   File: ${s.file}`);try{await i.workspace.fs.writeFile(l,new TextEncoder().encode(s.content))}catch(v){r.appendLine(`\u274C Could not write file: ${v.message}`),i.window.showErrorMessage(`ShipShape: Could not write ${s.file} \u2014 ${v.message}`);return}r.appendLine(`   Committing: ${s.commitMessage}`);let b=await i.window.withProgress({location:i.ProgressLocation.Notification,title:"ShipShape: Committing + pushing fix..."},()=>ye(c,{filePath:l.fsPath,commitMessage:s.commitMessage}));if(!b.ok){r.appendLine(`\u274C Could not commit + push: ${b.reason}`),i.window.showErrorMessage(`ShipShape: Fix written but not pushed \u2014 ${b.reason}`);return}r.appendLine("\u2705 Pushed to GitHub. Triggering new deployment...");let g;try{g=await o.triggerDeployment(a.serviceId)}catch(v){r.appendLine(`\u274C Could not trigger deployment: ${v.message}`),i.window.showErrorMessage(`ShipShape: Could not trigger redeploy \u2014 ${v.message}`);return}let m={...a,deploymentId:g.id};await t.globalState.update("shipshape.lastDeploy",m),r.appendLine(`\u{1F680} New deployment: ${g.id}`),r.appendLine(""),u("building");let k=new AbortController,de=n.streamDeploymentLogs(g.id,r,k.signal).catch(v=>{v?.name!=="AbortError"&&r.appendLine(`\u26A0 Log stream disconnected: ${v?.message??v}`)});try{let v=await tt(o,g.id,r);v.status==="healthy"?(r.appendLine(""),r.appendLine(`\u2705 Fix worked! Waiting ${oe/1e3}s for service discovery...`),u("deploying"),await we(oe),r.appendLine(`\u{1F310} Live at: ${a.serviceUrl}`),u("healthy",a.serviceUrl),i.commands.executeCommand("shipshape.refreshServices"),await i.window.showInformationMessage(`ShipShape: Fix applied \u2014 ${a.serviceName} is live at ${a.serviceUrl}`,"Open in Browser")==="Open in Browser"&&i.env.openExternal(i.Uri.parse(a.serviceUrl))):v.status==="failed"?(r.appendLine(""),r.appendLine("\u274C Fix did not resolve the issue. Re-diagnosing..."),k.abort(),await de,await st({...e,state:m})):(r.appendLine(""),r.appendLine(`\u26A0 Deployment ended with status: ${v.status}`),u("idle"))}finally{k.abort(),await de}}async function es(s,e){let t=[];s.kind==="platform"?t.push("Retry","View Logs"):t.push("View Logs","Retry");let o=await i.window.showErrorMessage(s.userMessage,...t);o==="View Logs"?e.show():o==="Retry"&&i.commands.executeCommand("shipshape.deploy")}function ts(s,e){let t=s.slice(-200).join(`
`);if(e==="building"||e==="build"||e==="queued"){if(/failed to resolve source metadata|not found.*dockerhub\/library|manifest.*not found/i.test(t)){let o=t.match(/dockerhub\/library\/([a-z0-9._-]+:[a-z0-9._-]+)/i);return{kind:"platform",userMessage:`Locus's image mirror does not carry \`${o?o[1]:"a base image"}\`. Swap your Dockerfile's FROM line to a mirrored image \u2014 node:20-alpine and most official language images work.`}}return/npm ERR!|Build failed|error TS\d+|Error: Cannot find module/i.test(t)?{kind:"user-code",userMessage:"Build failed in your project code. Check the logs \u2014 likely a missing dependency, TypeScript error, or Node build error."}:/DATABASE_URL.*(?:not set|undefined|required)|AUTH_SECRET.*(?:not set|required)/i.test(t)?{kind:"user-code",userMessage:"Build failed due to a missing environment variable. Add it via the env var manager and redeploy."}:/Nixpacks.*(?:failed|could not detect)/i.test(t)?{kind:"user-code",userMessage:"Locus could not auto-detect how to build your project. Add a Dockerfile or a .locusbuild config."}:{kind:"unknown",userMessage:"Build failed. Check the full logs below for the exact error."}}return e==="deploying"||e==="runtime"?/SIGTERM/i.test(t)&&/exit_code":\s*0|shutdown complete/i.test(t)?{kind:"user-code",userMessage:"Your container started and ran briefly, then was killed by Locus (SIGTERM). This is almost always a failed health check: the app is not responding on port 8080 at the configured healthCheck path. For Vite/React static sites, the server inside the container may be binding to the wrong port."}:/health.?check.*fail|unhealthy|task.*stopped.*health/i.test(t)?{kind:"user-code",userMessage:"Health check failed. Your container needs to respond 200 OK on port 8080 at the healthCheck path in your .locusbuild."}:/Error:.*(?:ENOENT|EADDRINUSE|EACCES)|uncaught exception|fatal error/i.test(t)?{kind:"user-code",userMessage:"Your container crashed at startup. Check the logs for the exception \u2014 typically a missing file, port in use, or permission issue."}:/caddy/i.test(t)&&/srv0/i.test(t)?{kind:"user-code",userMessage:"Locus built your static site with Caddy. It started but failed health checks \u2014 typically because Caddy binds to port 80/443 inside the container, not 8080. Add a Dockerfile or .locusbuild buildConfig that serves on PORT=8080."}:{kind:"user-code",userMessage:"Your container failed to stay healthy. Most common causes: (1) app not listening on port 8080, (2) app crashed at startup, (3) healthCheck path returns non-200. Check the logs below."}:/ECR.*unauthorized|registry.*timeout|rate.?limit/i.test(t)?{kind:"platform",userMessage:"Locus platform error talking to their image registry. Retry usually works."}:{kind:"unknown",userMessage:`Deployment failed in phase "${e}". Check the full logs below for details.`}}function ss(s){j(s,"Deploy failed")}function os(){return i.workspace.workspaceFolders?.[0]?.uri}function we(s){return new Promise(e=>setTimeout(e,s))}var T=p(require("vscode"));var d=p(require("vscode"));var ne=class extends d.TreeItem{constructor(t){super(t.name,d.TreeItemCollapsibleState.Expanded);this.project=t;this.kind="project";this.contextValue="project",this.iconPath=new d.ThemeIcon("folder"),this.tooltip=`Region: ${t.region}
ID: ${t.id}`,this.description=t.region}},re=class extends d.TreeItem{constructor(t){super(t.name,d.TreeItemCollapsibleState.Expanded);this.environment=t;this.kind="environment";this.contextValue="environment",this.iconPath=new d.ThemeIcon("server-environment"),this.description=t.type,this.tooltip=`Environment: ${t.name} (${t.type})`}},S=class extends d.TreeItem{constructor(t){super(t.name,d.TreeItemCollapsibleState.Collapsed);this.service=t;this.kind="service";this.contextValue="service",this.iconPath=ot(t.deploymentStatus),this.description=t.deploymentStatus??"not deployed",this.tooltip=[`Service: ${t.name}`,`Status: ${t.deploymentStatus??"not deployed"}`,t.url?`URL: ${t.url}`:void 0,t.lastDeployedAt?`Last deploy: ${t.lastDeployedAt}`:void 0,"","Click to stream logs. Right-click for more actions."].filter(o=>o!==void 0).join(`
`),this.command={command:"shipshape.viewLogs",title:"View Logs",arguments:[this]}}},_=class extends d.TreeItem{constructor(t,o){super(`Deploy #${t.version}`,d.TreeItemCollapsibleState.None);this.deployment=t;this.serviceId=o;this.kind="deployment";this.contextValue="deployment",this.iconPath=ot(t.status),this.description=`${t.status} \u2014 ${ns(t.createdAt)}`,this.tooltip=[`Deployment #${t.version}`,`Status: ${t.status}`,`Created: ${t.createdAt}`,t.durationMs!==null&&t.durationMs!==void 0?`Duration: ${Math.round(t.durationMs/1e3)}s`:void 0,"","Click to view logs. Right-click to roll back."].filter(n=>n!==void 0).join(`
`),this.command={command:"shipshape.viewLogs",title:"View Logs",arguments:[this]}}},M=class extends d.TreeItem{constructor(t,o){super(t,d.TreeItemCollapsibleState.None);this.kind="message";o&&(this.iconPath=new d.ThemeIcon(o)),this.contextValue="message"}};function ot(s){switch(s){case"healthy":return new d.ThemeIcon("vm-running",new d.ThemeColor("charts.green"));case"deploying":case"building":case"queued":return new d.ThemeIcon("sync~spin",new d.ThemeColor("charts.yellow"));case"failed":return new d.ThemeIcon("error",new d.ThemeColor("charts.red"));case"rolled_back":return new d.ThemeIcon("history",new d.ThemeColor("charts.orange"));case"cancelled":return new d.ThemeIcon("circle-slash",new d.ThemeColor("charts.gray"));default:return new d.ThemeIcon("vm",new d.ThemeColor("charts.gray"))}}function ns(s){let e=new Date(s).getTime();if(isNaN(e))return s;let t=Date.now()-e,o=Math.floor(t/1e3);if(o<60)return`${o}s ago`;let n=Math.floor(o/60);if(n<60)return`${n}m ago`;let r=Math.floor(n/60);return r<24?`${r}h ago`:`${Math.floor(r/24)}d ago`}var be=class{constructor(e){this.ttlMs=e;this.map=new Map}get(e){let t=this.map.get(e);if(t){if(Date.now()>t.expiresAt){this.map.delete(e);return}return t.value}}set(e,t){this.map.set(e,{value:t,expiresAt:Date.now()+this.ttlMs})}clear(){this.map.clear()}},ie=class{constructor(e){this.client=e;this._onDidChangeTreeData=new d.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this.cache=new be(3e4)}refresh(){this.cache.clear(),this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){try{return e?e instanceof ne?await this.loadEnvironments(e.project):e instanceof re?await this.loadServices(e.environment):e instanceof S?await this.loadDeployments(e.service):[]:await this.loadProjects()}catch(t){let o=t instanceof y?`Error: ${t.message}`:`Error: ${t.message}`;return[new M(o,"warning")]}}async loadProjects(){let e=this.cache.get("projects"),t=e??await this.client.listProjects();return e||this.cache.set("projects",t),t.length===0?[new M('No projects yet \u2014 run "ShipShape: Deploy Workspace"',"info")]:t.map(o=>new ne(o))}async loadEnvironments(e){let t=`envs:${e.id}`,o=this.cache.get(t),n=o??await this.client.listEnvironments(e.id);return o||this.cache.set(t,n),n.length===0?[new M("(no environments)","info")]:n.map(r=>new re(r))}async loadServices(e){let t=`svcs:${e.id}`,o=this.cache.get(t),n=o??await this.client.listServices(e.id);return o||this.cache.set(t,n),n.length===0?[new M("(no services)","info")]:n.map(r=>new S(r))}async loadDeployments(e){let t=`deps:${e.id}`,o=this.cache.get(t),n=o??await this.client.listDeployments(e.id,5);return o||this.cache.set(t,n),n.length===0?[new M("(no deployments)","info")]:n.map(r=>new _(r,e.id))}};function nt(s,e){s.subscriptions.push(T.commands.registerCommand("shipshape.rollback",async t=>{let o,n;if(t instanceof _)o=t.deployment.id,n=`Deploy #${t.deployment.version}`;else if(t instanceof S)try{let l=(await e.listDeployments(t.service.id,10)).find(b=>b.status==="healthy"&&b.id!==t.service.lastDeploymentId);if(!l){T.window.showWarningMessage(`No previous healthy deployment found for ${t.service.name}.`);return}o=l.id,n=`Deploy #${l.version}`}catch(c){await j(c,"Failed to find previous deployment");return}if(!o){T.window.showInformationMessage("Right-click a deployment in the Services sidebar to roll back.");return}if(await T.window.showWarningMessage(`Roll back to ${n}? This will redeploy the previous image.`,{modal:!0},"Rollback")!=="Rollback")return;let a=await T.window.showInputBox({prompt:"Rollback reason (optional)",placeHolder:'e.g. "regression in latest deploy"'});try{await T.window.withProgress({location:T.ProgressLocation.Notification,title:`Rolling back to ${n}...`,cancellable:!1},async()=>{await e.rollbackDeployment(o,a||void 0)}),T.window.showInformationMessage("Rollback triggered. It may take a minute to apply."),await T.commands.executeCommand("shipshape.refreshServices")}catch(c){await j(c,"Rollback failed")}}))}var B=p(require("vscode"));function rt(s,e){s.subscriptions.push(B.commands.registerCommand("shipshape.openUrl",async t=>{let o;if(typeof t=="string"?o=t:t instanceof S&&(o=t.service.url),!o){B.window.showInformationMessage('No live URL yet. Deploy your workspace first with "ShipShape: Deploy Workspace".');return}await B.env.openExternal(B.Uri.parse(o))}))}var $=p(require("vscode"));function it(s,e){s.subscriptions.push($.commands.registerCommand("shipshape.restart",async t=>{if(!(t instanceof S)){$.window.showInformationMessage("Right-click a service in the Services sidebar to restart it.");return}if(await $.window.showWarningMessage(`Restart ${t.service.name}?`,{modal:!0},"Restart")==="Restart")try{await $.window.withProgress({location:$.ProgressLocation.Notification,title:`Restarting ${t.service.name}...`,cancellable:!1},async()=>{try{await e.restartService(t.service.id)}catch(n){if(n instanceof y&&n.statusCode===409){await e.redeployService(t.service.id);return}throw n}}),$.window.showInformationMessage(`${t.service.name} is restarting. It may take a minute to come back up.`),await $.commands.executeCommand("shipshape.refreshServices")}catch(n){await j(n,"Restart failed")}}))}var O=p(require("vscode"));var ae=new Map;function at(s,e){let t=ae.get(s);if(t)return t;let o=O.window.createOutputChannel(`ShipShape: ${e}`);return ae.set(s,o),o}function ct(s,e){s.subscriptions.push(O.commands.registerCommand("shipshape.viewLogs",async t=>{if(t instanceof _)return rs(e,t);if(t instanceof S)return is(e,t);O.window.showInformationMessage("Right-click a service or deployment in the Services sidebar to view logs.")})),s.subscriptions.push({dispose(){for(let t of ae.values())t.dispose();ae.clear()}})}async function rs(s,e){let t=`dep:${e.deployment.id}`,o=at(t,`Deploy #${e.deployment.version}`);o.show(!0),o.appendLine(`\u2500\u2500 Deployment #${e.deployment.version} (${e.deployment.status}) \u2500\u2500`);try{let n=await s.getDeploymentLogs(e.deployment.id);o.appendLine(`Phase: ${n.phase}  Status: ${n.deploymentStatus}`),n.reason&&o.appendLine(`Reason: ${n.reason}`),o.appendLine("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");for(let r of n.logs)o.appendLine(H(r))}catch(n){let r=(n instanceof y,n.message);o.appendLine(`\u26A0 Failed to fetch logs: ${r}`)}}async function is(s,e){let t=`svc:${e.service.id}`,o=at(t,e.service.name);o.show(!0),o.appendLine(`\u2500\u2500 Streaming logs for ${e.service.name} \u2500\u2500`);let n=new AbortController;new O.CancellationTokenSource().token.onCancellationRequested(()=>n.abort());try{await s.streamServiceLogs(e.service.id,a=>o.appendLine(a),n.signal)}catch(a){if(a.name==="AbortError")return;let c=(a instanceof y,a.message);o.appendLine(`\u26A0 Log stream ended: ${c}`)}}var C=p(require("vscode"));var ce=class{constructor(e,t){this.client=e;this.extensionUri=t;this.panels=new Map}show(e,t){let o=this.panels.get(e);if(o){o.reveal();return}let n=C.window.createWebviewPanel("shipshape.envVars",`Env Vars \u2014 ${t}`,C.ViewColumn.Active,{enableScripts:!0,retainContextWhenHidden:!0});n.iconPath=C.Uri.joinPath(this.extensionUri,"media","icons","shipshape.svg"),n.webview.html=this.renderHtml(n.webview,t),this.panels.set(e,n),n.onDidDispose(()=>this.panels.delete(e)),n.webview.onDidReceiveMessage(async r=>{try{r.type==="load"?await this.handleLoad(n,e):r.type==="save"&&await this.handleSave(n,e,t,r.variables)}catch(a){let c=(a instanceof y,a.message);this.post(n,{type:"error",message:c})}})}async handleLoad(e,t){let o=await this.client.getResolvedVariables(t);this.post(e,{type:"loaded",variables:o})}async handleSave(e,t,o,n){await C.window.withProgress({location:C.ProgressLocation.Notification,title:`Saving env vars for ${o}...`,cancellable:!1},async r=>{r.report({message:"Writing variables..."}),await this.client.setVariables(t,n),r.report({message:"Triggering redeploy..."}),await this.client.triggerDeployment(t)}),this.post(e,{type:"saved",success:!0}),C.window.showInformationMessage(`Env vars saved. ${o} is redeploying \u2014 watch the sidebar.`),C.commands.executeCommand("shipshape.refreshServices")}post(e,t){e.webview.postMessage(t)}renderHtml(e,t){let o=as();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${["default-src 'none'",`style-src ${e.cspSource} 'unsafe-inline'`,`script-src 'nonce-${o}'`].join("; ")}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Env Vars \u2014 ${dt(t)}</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme);
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h1 {
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0 0 4px 0;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    button {
      font-family: inherit;
      font-size: 0.9rem;
      padding: 4px 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button.icon {
      background: transparent;
      color: var(--vscode-foreground);
      padding: 4px 8px;
    }
    button.icon:hover:not(:disabled) {
      background: var(--vscode-toolbar-hoverBackground);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 8px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td {
      padding: 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }
    td.actions { width: 72px; text-align: right; }
    td.key    { width: 40%; }
    input[type="text"], input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 4px 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9rem;
      border-radius: 2px;
    }
    input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    .empty {
      text-align: center;
      padding: 32px 16px;
      color: var(--vscode-descriptionForeground);
    }
    .status {
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
      min-height: 1.2em;
    }
    .status.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <h1>Environment Variables</h1>
  <div class="subtitle">${dt(t)}</div>

  <div class="warning">
    \u26A0 Values shown are <strong>resolved</strong>. Templates like
    <code>\${{db.DATABASE_URL}}</code> appear as their final values.
    Saving persists the literal values and triggers a redeploy.
  </div>

  <div class="toolbar">
    <button id="add">+ Add Variable</button>
    <button id="save">Save &amp; Deploy</button>
    <button id="reload" class="secondary">Reload</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>Key</th>
        <th>Value</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <div id="empty" class="empty" hidden>No variables yet. Click "+ Add Variable" to create one.</div>
  <div id="status" class="status"></div>

  <script nonce="${o}">
    const vscode = acquireVsCodeApi();
    const rowsEl = document.getElementById('rows');
    const emptyEl = document.getElementById('empty');
    const statusEl = document.getElementById('status');
    const addBtn = document.getElementById('add');
    const saveBtn = document.getElementById('save');
    const reloadBtn = document.getElementById('reload');

    let revealed = new Set();

    function status(msg, isError) {
      statusEl.textContent = msg;
      statusEl.classList.toggle('error', !!isError);
    }

    function render(vars) {
      rowsEl.innerHTML = '';
      const entries = Object.entries(vars);
      emptyEl.hidden = entries.length > 0;
      for (const [k, v] of entries) {
        addRow(k, v);
      }
    }

    function addRow(key, value) {
      const tr = document.createElement('tr');
      const keyTd = document.createElement('td');
      keyTd.className = 'key';
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.placeholder = 'KEY';
      keyInput.value = key || '';
      keyInput.spellcheck = false;
      keyInput.autocapitalize = 'off';
      keyTd.appendChild(keyInput);

      const valTd = document.createElement('td');
      const valInput = document.createElement('input');
      const id = 'v_' + Math.random().toString(36).slice(2);
      valInput.dataset.id = id;
      valInput.type = revealed.has(id) ? 'text' : 'password';
      valInput.placeholder = 'value';
      valInput.value = value || '';
      valInput.spellcheck = false;
      valTd.appendChild(valInput);

      const actTd = document.createElement('td');
      actTd.className = 'actions';
      const revealBtn = document.createElement('button');
      revealBtn.className = 'icon';
      revealBtn.type = 'button';
      revealBtn.title = 'Reveal / hide';
      revealBtn.textContent = '\u{1F441}';
      revealBtn.onclick = () => {
        if (revealed.has(id)) {
          revealed.delete(id);
          valInput.type = 'password';
        } else {
          revealed.add(id);
          valInput.type = 'text';
        }
      };
      const delBtn = document.createElement('button');
      delBtn.className = 'icon';
      delBtn.type = 'button';
      delBtn.title = 'Remove';
      delBtn.textContent = '\u2715';
      delBtn.onclick = () => {
        tr.remove();
        emptyEl.hidden = rowsEl.children.length > 0;
      };
      actTd.appendChild(revealBtn);
      actTd.appendChild(delBtn);

      tr.appendChild(keyTd);
      tr.appendChild(valTd);
      tr.appendChild(actTd);
      rowsEl.appendChild(tr);
      emptyEl.hidden = true;
    }

    function collect() {
      const out = {};
      const rows = rowsEl.querySelectorAll('tr');
      for (const tr of rows) {
        const inputs = tr.querySelectorAll('input');
        const key = inputs[0].value.trim();
        const val = inputs[1].value;
        if (!key) continue;
        out[key] = val;
      }
      return out;
    }

    addBtn.onclick = () => addRow('', '');
    reloadBtn.onclick = () => { status('Loading...'); vscode.postMessage({ type: 'load' }); };

    saveBtn.onclick = () => {
      const variables = collect();
      const keys = Object.keys(variables);
      const unique = new Set(keys);
      if (keys.length !== unique.size) {
        status('Duplicate keys \u2014 each variable must have a unique name.', true);
        return;
      }
      saveBtn.disabled = true;
      addBtn.disabled = true;
      reloadBtn.disabled = true;
      status('Saving and redeploying...');
      vscode.postMessage({ type: 'save', variables });
    };

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'loaded') {
        render(msg.variables || {});
        status('');
        saveBtn.disabled = false;
        addBtn.disabled = false;
        reloadBtn.disabled = false;
      } else if (msg.type === 'saved') {
        status(msg.success ? 'Saved. Redeploying...' : ('Save failed: ' + (msg.error || '')), !msg.success);
        saveBtn.disabled = false;
        addBtn.disabled = false;
        reloadBtn.disabled = false;
      } else if (msg.type === 'error') {
        status('Error: ' + msg.message, true);
        saveBtn.disabled = false;
        addBtn.disabled = false;
        reloadBtn.disabled = false;
      }
    });

    // Initial load
    status('Loading...');
    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`}};function as(){let s="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)s+=e.charAt(Math.floor(Math.random()*e.length));return s}function dt(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function cs(s){let e=new Z(s.secrets);$e(),s.subscriptions.push({dispose:ue}),et(s,e),s.subscriptions.push(w.commands.registerCommand("shipshape.openSettings",async()=>{let n=await s.secrets.get("shipshape.buildApiKey"),r=await w.window.showInputBox({prompt:"Enter your Locus Build API key",password:!0,placeHolder:"claw_...",value:n?"(already set \u2014 enter new key to replace)":"",validateInput:a=>!a||a.startsWith("(already")||a.startsWith("claw_")?null:"Key must start with claw_"});!r||r.startsWith("(already")||(await s.secrets.store("shipshape.buildApiKey",r),e.clearTokenCache(),w.window.showInformationMessage("Locus API key saved."))})),nt(s,e),rt(s,e),it(s,e),ct(s,e);let t=new ce(e,s.extensionUri);s.subscriptions.push(w.commands.registerCommand("shipshape.manageEnvVars",async n=>{if(n instanceof S){t.show(n.service.id,n.service.name);return}w.window.showInformationMessage('Right-click a service in the Services sidebar and choose "Manage Env Vars".')})),s.subscriptions.push(w.commands.registerCommand("shipshape.configureAiApiKey",async()=>{if(await X(s.secrets)){let a=await w.window.showInformationMessage("A Gemini API key is already saved. Replace it?","Replace","Clear","Cancel");if(a==="Clear"){await Ce(s.secrets),w.window.showInformationMessage("Gemini API key cleared.");return}if(a!=="Replace")return}await Te(s.secrets)&&w.window.showInformationMessage("Gemini API key saved.")})),s.subscriptions.push(w.commands.registerCommand("shipshape.deployNL",()=>{w.window.showInformationMessage("AI-powered deploy \u2014 coming in Phase 6 (Tier 3 stretch).")}),w.commands.registerCommand("shipshape.provisionTenant",()=>{w.window.showInformationMessage("Multi-tenant provisioner \u2014 coming in Phase 6 (Tier 3 stretch).")}));let o=new ie(e);s.subscriptions.push(w.window.registerTreeDataProvider("shipshape.serviceExplorer",o),w.window.registerTreeDataProvider("shipshape.deploymentHistory",o),w.commands.registerCommand("shipshape.refreshServices",()=>o.refresh()))}function ds(){ue()}0&&(module.exports={activate,deactivate});
