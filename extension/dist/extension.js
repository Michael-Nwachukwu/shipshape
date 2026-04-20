"use strict";var Ot=Object.create;var he=Object.defineProperty;var Nt=Object.getOwnPropertyDescriptor;var _t=Object.getOwnPropertyNames;var Ut=Object.getPrototypeOf,Ft=Object.prototype.hasOwnProperty;var Gt=(o,e)=>{for(var t in e)he(o,t,{get:e[t],enumerable:!0})},He=(o,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of _t(e))!Ft.call(o,s)&&s!==t&&he(o,s,{get:()=>e[s],enumerable:!(n=Nt(e,s))||n.enumerable});return o};var h=(o,e,t)=>(t=o!=null?Ot(Ut(o)):{},He(e||!o||!o.__esModule?he(t,"default",{value:o,enumerable:!0}):t,o)),qt=o=>He(he({},"__esModule",{value:!0}),o);var Qo={};Gt(Qo,{activate:()=>Yo,deactivate:()=>Jo});module.exports=qt(Qo);var D=h(require("vscode"));var We=h(require("os")),Ke=h(require("path")),X=h(require("vscode")),Vt=Ke.join(We.homedir(),".config","locus","credentials.json");async function z(o){let e=await o.get("shipshape.buildApiKey");if(e)return{key:e,source:"secrets"};let t=await Ht();if(t)return{key:t,source:"cli-credentials"}}async function Ht(){try{let o=X.Uri.file(Vt),e=await X.workspace.fs.readFile(o),t=JSON.parse(new TextDecoder().decode(e));return typeof t.api_key=="string"&&t.api_key.startsWith("claw_")?t.api_key:void 0}catch{return}}var Ae="shipshape.geminiApiKey";async function Z(o){return o.get(Ae)}async function fe(o,e){let t=e?`${e} \u2014 paste a Gemini API key (free at aistudio.google.com/apikey)`:"Paste a Gemini API key (free at aistudio.google.com/apikey)",n=await X.window.showInputBox({prompt:t,password:!0,placeHolder:"AIza...",ignoreFocusOut:!0,validateInput:s=>s?s.length<20?"Key looks too short":null:"Required"});if(n)return await o.store(Ae,n),n}async function ze(o){await o.delete(Ae)}var ie="https://beta-api.buildwithlocus.com/v1",j=null,Ye=["healthy","failed","cancelled","rolled_back"];function re(o){if(typeof o=="string")return o;if(o==null)return"";let e=o.message??o.log??o.text??o.line;if(typeof e=="string")return`${o.timestamp?`[${o.timestamp}] `:""}${e}`;try{return JSON.stringify(o)}catch{return String(o)}}var x=class extends Error{constructor(t,n,s,i,r){super(t);this.statusCode=n;this.details=s;this.creditBalance=i;this.requiredAmount=r;this.name="LocusError"}},ve=class{constructor(e){this.secrets=e}async getToken(){if(j)return j;let e=await z(this.secrets);if(!e)throw new x('No API key configured. Run "ShipShape: Configure Locus API Key" first.',401);return j=await this.exchangeApiKey(e.key),j}async exchangeApiKey(e){let t=await fetch(`${ie}/auth/exchange`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:e})});if(!t.ok){let s=await t.json().catch(()=>({error:"Token exchange failed"}));throw new x(s.error??"Token exchange failed",t.status)}return(await t.json()).token}async verifyOrRefreshToken(){let e=await this.getToken();try{return await this._request("GET","/auth/whoami",void 0,e),e}catch(t){if(!(t instanceof x)||t.statusCode!==401)throw t;try{let s=await fetch(`${ie}/auth/refresh`,{method:"POST",headers:{Authorization:`Bearer ${e}`}});if(s.ok)return j=(await s.json()).token,j}catch{}j=null;let n=await z(this.secrets);if(!n)throw new x("Session expired. Please re-enter your API key.",401);return j=await this.exchangeApiKey(n.key),j}}clearTokenCache(){j=null}async _request(e,t,n,s){let i=s??await this.getToken(),r=await fetch(`${ie}${t}`,{method:e,headers:{Authorization:`Bearer ${i}`,...n!==void 0?{"Content-Type":"application/json"}:{}},body:n!==void 0?JSON.stringify(n):void 0});if(r.status===204)return;let a=await r.json().catch(()=>({}));if(!r.ok)throw new x(a.error??`${e} ${t} failed (${r.status})`,r.status,a.details,a.creditBalance,a.requiredAmount);return a}async whoami(){return this._request("GET","/auth/whoami")}async getBillingBalance(){return this._request("GET","/billing/balance")}async createProject(e,t,n){return this._request("POST","/projects",{name:e,region:t,description:n})}async listProjects(){return(await this._request("GET","/projects")).projects}async getProject(e){return this._request("GET",`/projects/${e}`)}async fromRepo(e,t="main",n,s){return this._request("POST","/projects/from-repo",{repo:e,branch:t,name:n,region:s})}async fromLocusbuild(e){return this._request("POST","/projects/from-locusbuild",{name:e.name,repo:e.repo,branch:e.branch??"main",locusbuild:e.locusbuild})}async verifyLocusbuild(e){return this._request("POST","/projects/verify-locusbuild",{locusbuild:e})}async createEnvironment(e,t,n){return this._request("POST",`/projects/${e}/environments`,{name:t,type:n})}async listEnvironments(e){return(await this._request("GET",`/projects/${e}/environments`)).environments}async createService(e){return this._request("POST","/services",{...e,runtime:e.runtime??{port:8080}})}async getService(e,t=!1){let n=t?"?include=runtime":"";return this._request("GET",`/services/${e}${n}`)}async listServices(e){return(await this._request("GET",`/services/environment/${e}`)).services}async updateService(e,t){return this._request("PATCH",`/services/${e}`,t)}async restartService(e){return this._request("POST",`/services/${e}/restart`)}async redeployService(e){return this._request("POST",`/services/${e}/redeploy`)}async deleteService(e){return this._request("DELETE",`/services/${e}`)}async triggerDeployment(e){return this._request("POST","/deployments",{serviceId:e})}async getDeployment(e){return this._request("GET",`/deployments/${e}`)}async listDeployments(e,t=10){return(await this._request("GET",`/deployments/service/${e}?limit=${t}`)).deployments}async cancelDeployment(e){return this._request("POST",`/deployments/${e}/cancel`)}async rollbackDeployment(e,t){return this._request("POST",`/deployments/${e}/rollback`,{reason:t})}async setVariables(e,t){return this._request("PUT",`/variables/service/${e}`,{variables:t})}async mergeVariables(e,t){return this._request("PATCH",`/variables/service/${e}`,{variables:t})}async getResolvedVariables(e){return(await this._request("GET",`/variables/service/${e}/resolved`)).variables}async createAddon(e,t,n,s){return this._request("POST","/addons",{projectId:e,environmentId:t,type:n,name:s})}async getAddon(e){return this._request("GET",`/addons/${e}`)}async listAddons(e){return(await this._request("GET",`/addons/environment/${e}`)).addons??[]}async deleteAddon(e){return this._request("DELETE",`/addons/${e}`)}async listDomains(){return(await this._request("GET","/domains")).domains??[]}async listDomainsByProject(e){return(await this._request("GET",`/domains/project/${e}`)).domains??[]}async getDomain(e){return this._request("GET",`/domains/${e}`)}async createDomain(e,t){return this._request("POST","/domains",{domain:e,projectId:t})}async verifyDomain(e){return this._request("POST",`/domains/${e}/verify`)}async attachDomain(e,t){return this._request("POST",`/domains/${e}/attach`,{serviceId:t})}async detachDomain(e){await this._request("POST",`/domains/${e}/detach`)}async deleteDomain(e){await this._request("DELETE",`/domains/${e}`)}async getDeploymentLogs(e){return this._request("GET",`/deployments/${e}/logs`)}async streamDeploymentLogs(e,t,n){let s=await this.getToken(),i=await fetch(`${ie}/deployments/${e}/logs?follow=true`,{headers:{Authorization:`Bearer ${s}`},signal:n});i.body&&await this._consumeSseStream(i.body,t)}async streamServiceLogs(e,t,n){let s=await this.getToken(),i=await fetch(`${ie}/services/${e}/logs?follow=true`,{headers:{Authorization:`Bearer ${s}`},signal:n});i.body&&await this._consumeSseStream(i.body,t)}async _consumeSseStream(e,t){let n=e.getReader(),s=new TextDecoder;try{for(;;){let{done:i,value:r}=await n.read();if(i)break;let a=s.decode(r,{stream:!0});for(let d of a.split(`
`))d.startsWith("data:")&&t(d.replace(/^data:\s?/,""))}}finally{n.releaseLock()}}async checkRepoAccess(e){return this._request("GET",`/github/repo-access?repo=${encodeURIComponent(e)}`)}async getGitRemoteUrl(){return this._request("GET","/git/remote-url")}async createWebhook(e,t,n){return this._request("POST","/webhooks",{projectId:e,url:t,events:n})}async deleteWebhook(e){return this._request("DELETE",`/webhooks/${e}`)}};var ee=h(require("vscode")),Wt={idle:{text:"$(shipshape-logo) ShipShape",tooltip:"Click to deploy"},detecting:{text:"$(search) ShipShape: Detecting...",tooltip:"Detecting project type"},building:{text:"$(tools) ShipShape: Building...",tooltip:"Building Docker image (2-4 min)"},deploying:{text:"$(sync~spin) ShipShape: Deploying...",tooltip:"Starting container (1-3 min)"},healthy:{text:"$(check) ShipShape: Live",tooltip:"Click to open live URL"},failed:{text:"$(error) ShipShape: Failed",tooltip:"Click to view logs"}},R;function Je(){return R=ee.window.createStatusBarItem(ee.StatusBarAlignment.Left,100),g("idle"),R.show(),R}function g(o,e){if(!R)return;let t=Wt[o];R.text=t.text,o==="healthy"&&e?(R.tooltip=`Live at ${e} \u2014 Click to open in browser`,R.command={command:"vscode.open",arguments:[ee.Uri.parse(e)],title:"Open in Browser"}):o==="failed"?(R.tooltip=t.tooltip,R.command="shipshape.viewLogs"):(R.tooltip=t.tooltip,R.command="shipshape.deploy")}function Be(){R?.dispose(),R=void 0}var c=h(require("vscode"));var G=h(require("vscode"));function je(o,e){let t=e?`${e}: `:"",n=!!e&&/domain/i.test(e);if(o instanceof x){let s=n&&/limit|max(imum)?|quota|too many/i.test(`${o.message} ${o.details??""}`);switch(o.statusCode){case 400:return s?{message:`${t}Domain limit reached \u2014 max 20 per workspace. Remove an unused domain to free a slot.`,actions:[{label:"Open Dashboard",url:"https://beta.buildwithlocus.com/domains"}]}:{message:`${t}${o.message}${o.details?` \u2014 ${o.details}`:""}`};case 401:return{message:`${t}Authentication failed. Your API key may be invalid or expired.`,actions:[{label:"Re-enter API Key"}]};case 402:{let i=o.creditBalance!==void 0?`$${o.creditBalance}`:"unknown",r=o.requiredAmount!==void 0?`$${o.requiredAmount}`:"$0.25";return{message:`${t}Insufficient credits (balance: ${i}, need: ${r}).`,actions:[{label:"Add Credits",url:"https://beta.buildwithlocus.com/billing"}]}}case 404:return{message:`${t}Resource not found \u2014 it may have been deleted or never existed.`};case 409:return{message:`${t}Conflict \u2014 ${o.message}${o.details?` (${o.details})`:""}`};case 429:return n&&/pending|validat|limit|max/i.test(`${o.message} ${o.details??""}`)?{message:`${t}Domain validation limit reached \u2014 max 5 pending domains per workspace. Wait for existing ones to validate or remove them.`,actions:[{label:"Open Dashboard",url:"https://beta.buildwithlocus.com/domains"}]}:{message:`${t}Rate limited by Locus API. Wait a moment and try again.`};case 500:case 502:case 503:case 504:return{message:`${t}Locus API is having issues (HTTP ${o.statusCode}). Try again in a minute.`};default:return{message:`${t}${o.message}${o.details?` \u2014 ${o.details}`:""}`}}}return o instanceof Error?o.name==="AbortError"?{message:`${t}Request cancelled.`}:/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(o.message)?{message:`${t}Network error \u2014 check your internet connection and try again.`}:{message:`${t}${o.message}`}:{message:`${t}Unknown error \u2014 ${String(o)}`}}async function T(o,e){let{message:t,actions:n}=je(o,e),s=(n??[]).map(a=>a.label),i=await G.window.showErrorMessage(`ShipShape: ${t}`,...s);if(!i)return;let r=(n??[]).find(a=>a.label===i);r?.url?G.env.openExternal(G.Uri.parse(r.url)):r?.label==="Re-enter API Key"&&G.commands.executeCommand("shipshape.openSettings")}var q=h(require("vscode")),Oe=h(require("path")),te={nextjs:"Next.js","react-vite":"React + Vite",express:"Express (Node.js)",fastapi:"FastAPI (Python)",django:"Django (Python)",rails:"Ruby on Rails","generic-node":"Generic Node.js","generic-python":"Generic Python",dockerfile:"Dockerfile (custom)",unknown:"Unknown"};async function Qe(o){if(await Kt(o,"Dockerfile"))return"dockerfile";let e=await zt(o,"package.json");if(e){let i={...e.dependencies??{},...e.devDependencies??{}};return"next"in i?"nextjs":"react"in i&&"vite"in i?"react-vite":"express"in i?"express":"generic-node"}let t=await we(o,"requirements.txt");if(t!==null){let i=t.toLowerCase();return/\bfastapi\b/.test(i)?"fastapi":/\bdjango\b/.test(i)?"django":"generic-python"}let n=await we(o,"pyproject.toml");if(n!==null){let i=n.toLowerCase();return/fastapi/.test(i)?"fastapi":/django/.test(i)?"django":"generic-python"}let s=await we(o,"Gemfile");return s!==null&&/\brails\b/i.test(s)?"rails":"unknown"}async function Kt(o,e){try{let t=q.Uri.file(Oe.join(o.fsPath,e));return(await q.workspace.fs.stat(t)).type===q.FileType.File}catch{return!1}}async function we(o,e){try{let t=q.Uri.file(Oe.join(o.fsPath,e)),n=await q.workspace.fs.readFile(t);return new TextDecoder().decode(n)}catch{return null}}async function zt(o,e){let t=await we(o,e);if(t===null)return null;try{return JSON.parse(t)}catch{return null}}var ke=h(require("vscode")),Xe=h(require("path"));var Yt="gemini-2.5-flash",Jt="https://generativelanguage.googleapis.com/v1beta/models",$=class extends Error{constructor(t,n,s){super(t);this.statusCode=n;this.body=s;this.name="GeminiError"}},Qt=new Set([429,500,502,503,504]),Ne=2,Xt=1500;async function ye(o,e){let t=e.model??Yt,n=`${Jt}/${encodeURIComponent(t)}:generateContent`,s={systemInstruction:{parts:[{text:e.system}]},contents:[{role:"user",parts:[{text:e.userMessage}]}],generationConfig:{temperature:.2,maxOutputTokens:e.maxTokens??4e3,...e.jsonMode?{responseMimeType:"application/json"}:{},...e.responseSchema?{responseSchema:e.responseSchema}:{}}},i,r;for(let u=0;u<=Ne;u++){try{if(i=await fetch(n,{method:"POST",headers:{"x-goog-api-key":o,"Content-Type":"application/json"},body:JSON.stringify(s)}),i.ok||!Qt.has(i.status)||u===Ne)break}catch(p){if(r=p,u===Ne)throw p}await new Promise(p=>setTimeout(p,Xt*2**u))}if(!i)throw new $(`Gemini network error: ${r?.message??"unknown"}`,0);if(!i.ok){let u;try{u=await i.json()}catch{}throw new $(`Gemini API returned ${i.status}`,i.status,u)}let a=await i.json();if(a.error)throw new $(a.error.message,a.error.code||500,a.error);if(a.promptFeedback?.blockReason)throw new $(`Gemini blocked the prompt: ${a.promptFeedback.blockReason}`,400,a.promptFeedback);let d=a.candidates?.[0],f=d?.content?.parts?.[0]?.text;if(!f)throw new $("Empty response from Gemini",500,a);if(d?.finishReason==="MAX_TOKENS")throw new $("Gemini response was truncated (hit max output tokens). Increase maxTokens or simplify the request.",500,{finishReason:d.finishReason,rawLength:f.length});return f}function be(o){let e=o.trim(),t=e.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);return t&&(e=t[1].trim()),JSON.parse(e)}var Zt=`You are an expert deployment failure diagnostician for the Locus PaaS.
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
- If the failure is platform-side (owner: "platform"), set fix: null \u2014 user can't fix it, only retry.`;function eo(o,e){let t=o.logs.slice(-200).join(`
`),n=e.length>0?e.map(s=>`
===== FILE: ${s.path} =====
${s.content}`).join(`
`):`
(no project files attached)`;return`Deployment failed.

Phase at failure: ${o.phase}
Project type: ${te[o.projectType]} (${o.projectType})
Repo: ${o.repoSlug}

---- LAST ${Math.min(o.logs.length,200)} LOG LINES ----
${t}

---- PROJECT FILES ----${n}`}async function to(o){let e=["Dockerfile",".locusbuild","package.json","requirements.txt","pyproject.toml","Gemfile","nixpacks.toml"],t=[];for(let s of e)try{let i=ke.Uri.file(Xe.join(o.fsPath,s)),r=await ke.workspace.fs.readFile(i),a=new TextDecoder().decode(r);a.length>8e3&&(a=a.slice(0,8e3)+`
... [truncated, file is ${r.byteLength} bytes total]`),t.push({path:s,content:a})}catch{}return t}var oo={type:"OBJECT",properties:{summary:{type:"STRING"},rootCause:{type:"STRING"},owner:{type:"STRING",enum:["user","platform","config","unknown"]},confidence:{type:"STRING",enum:["high","medium","low"]},fix:{type:"OBJECT",nullable:!0,properties:{description:{type:"STRING"},file:{type:"STRING"},action:{type:"STRING",enum:["replace"]},content:{type:"STRING"},commitMessage:{type:"STRING"}},required:["description","file","action","content","commitMessage"]}},required:["summary","rootCause","owner","confidence","fix"]};async function Ze(o,e){let t=await to(e.workspaceRoot),n=eo(e,t),s=await ye(o,{system:Zt,userMessage:n,maxTokens:8e3,jsonMode:!0,responseSchema:oo}),i;try{i=be(s)}catch(r){throw new $(`Gemini returned malformed JSON: ${r.message}. Raw response (first 300 chars): ${s.slice(0,300)}`,500,{raw:s.slice(0,1e3)})}if(typeof i.summary!="string"||typeof i.rootCause!="string")throw new $("Diagnosis JSON missing required fields",500,i);return i}var gt=h(require("path"));var V=h(require("vscode")),_e=h(require("path")),no=/github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/;async function ae(o){try{let e=V.Uri.file(_e.join(o.fsPath,".git","config")),t=await V.workspace.fs.readFile(e),n=new TextDecoder().decode(t);return so(n)}catch{return}}function so(o){for(let e of o.split(`
`)){let t=e.trim();if(!t.startsWith("url ="))continue;let s=t.replace(/^url\s*=\s*/,"").trim().match(no);if(s)return s[1]}}async function et(o){try{let e=V.Uri.file(_e.join(o.fsPath,".git"));return(await V.workspace.fs.stat(e)).type===V.FileType.Directory}catch{return!1}}var oe=h(require("vscode")),tt=h(require("path")),io={nextjs:{services:{web:{path:".",port:8080,healthCheck:"/"}}},"react-vite":{services:{web:{path:".",port:8080,healthCheck:"/"}}},express:{services:{api:{path:".",port:8080,healthCheck:"/"}}},fastapi:{services:{api:{path:".",port:8080,healthCheck:"/health"}}},django:{services:{api:{path:".",port:8080,healthCheck:"/"}}},rails:{services:{api:{path:".",port:8080,healthCheck:"/"}}},dockerfile:{services:{web:{path:".",port:8080,healthCheck:"/"}}},"generic-node":{services:{web:{path:".",port:8080,healthCheck:"/"}}},"generic-python":{services:{api:{path:".",port:8080,healthCheck:"/"}}},unknown:null};function ot(o){return io[o]}async function ce(o){return oe.Uri.file(tt.join(o.fsPath,".locusbuild"))}async function Ue(o){try{let e=await ce(o),t=await oe.workspace.fs.readFile(e),n=new TextDecoder().decode(t);return JSON.parse(n)}catch{return null}}async function Se(o,e){let t=await ce(o),n=new TextEncoder().encode(JSON.stringify(e,null,2)+`
`);return await oe.workspace.fs.writeFile(t,n),t}async function Pe(o){try{let e=await ce(o);return await oe.workspace.fs.stat(e),!0}catch{return!1}}var de=h(require("vscode")),nt=h(require("path")),ro=new Set(["react-vite"]);function st(o){return ro.has(o)}var ao={"react-vite":`# Auto-generated by ShipShape.
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
`};function it(o){return ao[o]}function xe(o){return de.Uri.file(nt.join(o.fsPath,"Dockerfile"))}async function rt(o){try{return await de.workspace.fs.stat(xe(o)),!0}catch{return!1}}async function at(o,e){let t=xe(o);return await de.workspace.fs.writeFile(t,new TextEncoder().encode(e)),t}var ct=h(require("vscode"));async function co(){let o=ct.extensions.getExtension("vscode.git");return o?(o.isActive?o.exports:await o.activate()).getAPI(1):void 0}async function lo(o){let e=await co();if(e)return e.repositories.find(t=>t.rootUri.fsPath===o.fsPath)}async function Fe(o,e){let t=await lo(o);if(!t)return{ok:!1,reason:"No git repository detected in this workspace."};try{await t.add([e.filePath]),await t.commit(e.commitMessage)}catch(i){return{ok:!1,reason:`git commit failed: ${i.message}`}}let n=t.state.HEAD?.name,s=!!t.state.HEAD?.upstream;try{if(s)await t.push();else if(n)await t.push("origin",n,!0);else return{ok:!1,reason:"Commit created, but could not push \u2014 branch has no name."}}catch(i){return{ok:!1,reason:`git push failed: ${i.message}`}}return{ok:!0}}var dt=h(require("vscode")),ne=class{constructor(e){this._client=e;this._channels=new Map}getOrCreateChannel(e){let t=this._channels.get(e);if(t)return t;let n=dt.window.createOutputChannel(`ShipShape: ${e}`);return this._channels.set(e,n),n}disposeChannel(e){this._channels.get(e)?.dispose(),this._channels.delete(e)}disposeAll(){for(let e of this._channels.values())e.dispose();this._channels.clear()}async streamDeploymentLogs(e,t,n){await this._client.streamDeploymentLogs(e,s=>{s.trim()&&t.appendLine(s)},n)}async streamServiceLogs(e,t,n){await this._client.streamServiceLogs(e,s=>{s.trim()&&t.appendLine(s)},n)}};var po=6e4,lt=15*6e4,H=6e4;async function le(o,e,t){let n=Date.now(),s=null;for(;;){if(Date.now()-n>lt)throw t.appendLine(`\u26A0 Polling timed out after ${lt/6e4} minutes.`),new Error("Deployment polling timeout");let i=await o.getDeployment(e);if(i.status!==s&&(t.appendLine(`[${new Date().toISOString()}] Status: ${i.status}`),uo(i.status),s=i.status),Ye.includes(i.status))return i;await se(po)}}function uo(o){switch(o){case"queued":case"building":g("building");break;case"deploying":g("deploying");break;case"healthy":break;case"failed":case"cancelled":case"rolled_back":g("failed");break}}function se(o){return new Promise(e=>setTimeout(e,o))}var ht=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,mo=/github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;function pt(o){let e=o.trim();if(ht.test(e))return e;let t=e.match(mo);return t?t[1]:void 0}function ft(o,e){let t=new ne(e);o.subscriptions.push(c.commands.registerCommand("shipshape.deploy",async()=>{try{await go(o,e,t)}catch(n){Eo(n),g("failed")}})),o.subscriptions.push({dispose:()=>t.disposeAll()})}async function go(o,e,t){if(!await ho(o,e))return;await c.window.withProgress({location:c.ProgressLocation.Notification,title:"ShipShape: Verifying credentials..."},async()=>{await e.verifyOrRefreshToken()});let s=await e.getBillingBalance();if(s.creditBalance<.25){await c.window.showErrorMessage(`Insufficient Locus credits ($${s.creditBalance.toFixed(2)}). Each service costs $0.25/month.`,"Add Credits")==="Add Credits"&&c.env.openExternal(c.Uri.parse("https://beta.buildwithlocus.com/billing"));return}if(s.warnings&&s.warnings.length>0)for(let b of s.warnings)c.window.showWarningMessage(`ShipShape: ${b.message}`);let i=Lo();if(!i){c.window.showErrorMessage("Open a folder first \u2014 deploy needs a workspace.");return}g("detecting");let r=await Qe(i),a=await fo(r);if(!a){g("idle");return}if(!await vo(i,a)){g("idle");return}if(!await Pe(i)){let b=ot(a);if(!b){c.window.showErrorMessage("Could not auto-generate a .locusbuild for this project. Create one manually and retry."),g("idle");return}let S=await Se(i,b),M=await c.workspace.openTextDocument(S);if(await c.window.showTextDocument(M,{preview:!1}),await c.window.showInformationMessage("Generated .locusbuild \u2014 review it, then deploy.",{modal:!1},"Deploy","Cancel")!=="Deploy"){g("idle");return}}let u=await Ue(i);if(u)try{let b=await e.verifyLocusbuild(u);if(!b.valid){c.window.showErrorMessage(`Invalid .locusbuild: ${b.errors.join("; ")}`),g("idle");return}}catch(b){console.warn("verify-locusbuild failed, continuing:",b)}let p=await wo(i);if(!p){g("idle");return}let m,w=(await e.listProjects()).find(b=>b.name===p.split("/")[1]||b.name===p);if(w){let S=(await e.listEnvironments(w.id))[0];if(!S){c.window.showErrorMessage("Project exists but has no environments. Clean it up in the dashboard."),g("idle");return}let M=await e.listServices(S.id),F=M[0];if(!F)m=await ut(e,p);else{await yo(e,i,M);let Ve=await e.triggerDeployment(F.id);m={project:w,environment:S,services:[F],deployments:[Ve]},c.window.showInformationMessage(`Redeploying existing project "${w.name}"...`)}}else m=await ut(e,p);let y=m.services[0],P=m.deployments[0];if(!y||!P){c.window.showErrorMessage("Deployment kicked off but response was malformed."),g("failed");return}let _={projectId:m.project.id,environmentId:m.environment.id,serviceId:y.id,serviceName:y.name,serviceUrl:y.url,deploymentId:P.id,repoSlug:p};await o.globalState.update("shipshape.lastDeploy",_);let k=t.getOrCreateChannel(p);k.show(!0),k.appendLine(`\u{1F680} Deployment started \u2014 ${new Date().toISOString()}`),k.appendLine(`   Project:    ${m.project.name} (${m.project.id})`),k.appendLine(`   Service:    ${y.name} (${y.id})`),k.appendLine(`   Deployment: ${P.id}`),k.appendLine(`   Repo:       ${p}`),k.appendLine(""),g("building");let U=new AbortController,ge=t.streamDeploymentLogs(P.id,k,U.signal).catch(b=>{b?.name!=="AbortError"&&k.appendLine(`\u26A0 Log stream disconnected: ${b?.message??b}`)});try{let b=await le(e,P.id,k);if(b.status==="healthy"){k.appendLine(""),k.appendLine(`\u2705 Deployment healthy. Waiting ${H/1e3}s for service discovery...`),g("deploying"),await se(H),k.appendLine(`\u{1F310} Live at: ${y.url}`),g("healthy",y.url),c.commands.executeCommand("shipshape.refreshServices");let S=await c.window.showInformationMessage(`ShipShape: ${y.name} is live at ${y.url}`,"Open in Browser","View Logs");S==="Open in Browser"?c.env.openExternal(c.Uri.parse(y.url)):S==="View Logs"&&k.show()}else b.status==="failed"?(k.appendLine(""),k.appendLine("\u274C Deployment failed."),U.abort(),await ge,await vt({context:o,client:e,logProvider:t,channel:k,state:_,projectType:a,workspaceRoot:i})):(k.appendLine(""),k.appendLine(`\u26A0 Deployment ended with status: ${b.status}`),g("idle"))}finally{U.abort(),await ge}}async function ho(o,e){let t=await z(o.secrets);if(t)return t.key;let n=await c.window.showInputBox({prompt:"Enter your Locus Build API key",password:!0,placeHolder:"claw_...",ignoreFocusOut:!0,validateInput:s=>s&&!s.startsWith("claw_")?"Key must start with claw_":null});if(n)return await o.secrets.store("shipshape.buildApiKey",n),e.clearTokenCache(),n}async function fo(o){let e=te[o];o==="unknown"&&c.window.showWarningMessage("Could not auto-detect a framework. Pick one, or cancel and add a Dockerfile/.locusbuild manually.");let t=[{label:`$(check) Use detected: ${e}`,description:o,detail:"Generate a .locusbuild based on this detection"},{label:"",kind:c.QuickPickItemKind.Separator},...Object.entries(te).filter(([s])=>s!==o&&s!=="unknown").map(([s,i])=>({label:i,description:s})),{label:"$(close) Cancel",description:"cancel"}],n=await c.window.showQuickPick(t,{title:"ShipShape: Confirm project type",placeHolder:`Detected: ${e}`,ignoreFocusOut:!0});if(!(!n||n.description==="cancel"))return n.description===o||n.label.startsWith("$(check)")?o==="unknown"?void 0:o:n.description}async function vo(o,e){if(!st(e)||await rt(o))return!0;let t=it(e);if(!t)return!0;let n=te[e],s=await c.window.showWarningMessage(`ShipShape: ${n} projects need a Dockerfile to bind to port 8080. Nixpacks' default serves on port 80 and will fail health checks. Generate one now?`,{modal:!0},"Generate Dockerfile","Deploy anyway");if(s==="Deploy anyway")return c.window.showWarningMessage("Proceeding without a Dockerfile. Deployment is likely to fail at runtime health check."),!0;if(s!=="Generate Dockerfile")return!1;let i=await at(o,t),r=await c.workspace.openTextDocument(i);await c.window.showTextDocument(r,{preview:!1});let a=await c.window.showInformationMessage("Dockerfile written. Locus builds from GitHub, so we need to commit + push before deploying.",{modal:!0},"Commit & push","I'll commit manually","Cancel");if(a==="Cancel"||!a)return!1;if(a==="I'll commit manually")return c.window.showInformationMessage('Commit the Dockerfile and push to your default branch, then run "ShipShape: Deploy Workspace" again.'),!1;let d=await c.window.withProgress({location:c.ProgressLocation.Notification,title:"ShipShape: Committing Dockerfile..."},async()=>Fe(o,{filePath:xe(o).fsPath,commitMessage:"Add Dockerfile for Locus deploy (port 8080)"}));if(!d.ok){if(await c.window.showErrorMessage(`Could not commit + push automatically: ${d.reason}`,"Open terminal","Cancel")==="Open terminal"){let u=c.window.createTerminal("ShipShape");u.show(),u.sendText('git add Dockerfile && git commit -m "Add Dockerfile for Locus deploy" && git push')}return!1}return c.window.showInformationMessage("Dockerfile committed and pushed. Continuing deploy..."),!0}async function wo(o){let e=c.workspace.getConfiguration("shipshape"),t=e.get("githubRepo");if(t&&ht.test(t))return t;let n=await ae(o);if(n){let r=await c.window.showInformationMessage(`ShipShape: Deploy from GitHub repo "${n}"?`,{modal:!1},"Yes","Use a different repo");if(r==="Yes")return await e.update("githubRepo",n,c.ConfigurationTarget.Workspace),n;if(!r)return}else if(!await et(o)){if(await c.window.showWarningMessage("This folder has no git repository. Push your code to GitHub first, then deploy.","Enter repo manually")!=="Enter repo manually")return}else if(await c.window.showWarningMessage('No GitHub remote found. Add one with "git remote add origin https://github.com/owner/repo" and push, or enter the repo manually.',"Enter repo manually")!=="Enter repo manually")return;let s=await c.window.showInputBox({prompt:"GitHub repo \u2014 paste the URL or enter owner/repo",placeHolder:"e.g. https://github.com/owner/repo  or  owner/repo",ignoreFocusOut:!0,validateInput:r=>r?pt(r)?null:"Could not parse a GitHub repo from that input":"Required"});if(!s)return;let i=pt(s);return await e.update("githubRepo",i,c.ConfigurationTarget.Workspace),i}async function ut(o,e){return c.window.withProgress({location:c.ProgressLocation.Notification,title:`ShipShape: Creating project from ${e}...`},async()=>{let t=c.workspace.getConfiguration("shipshape").get("defaultRegion")??"us-east-1",n=e.split("/")[1];return o.fromRepo(e,"main",n,t)})}async function yo(o,e,t){let n=await Ue(e);if(n?.services)for(let[s,i]of Object.entries(n.services)){let r=t.find(d=>d.name===s);if(!r)continue;let a=i.healthCheck;if(a)try{await o.updateService(r.id,{healthCheckPath:a}),c.window.showInformationMessage(`Synced healthCheck for "${s}": ${a}`)}catch(d){console.warn(`Failed to sync healthCheck for ${s}:`,d)}}}async function bo(o,e,t){t.appendLine(""),t.appendLine("\u2500\u2500\u2500 Fetching full deployment logs \u2500\u2500\u2500");let n=[],s="unknown";try{let i=await o.getDeploymentLogs(e),r=i.logs??[];s=i.phase??"unknown",i.reason&&t.appendLine(`Reason: ${i.reason}`),t.appendLine(`Phase at failure: ${s}`),t.appendLine(`Total log lines: ${r.length}`),t.appendLine(""),n=r.map(re);let a=n.slice(-100);for(let d of a)t.appendLine(d)}catch(i){t.appendLine(`\u26A0 Could not fetch full logs: ${i.message}`);try{let r=await o.getDeployment(e);if(r.lastLogs){n=r.lastLogs.map(re);for(let a of n)t.appendLine(a)}}catch{}}return{phase:s,renderedLines:n}}async function vt(o){let{context:e,client:t,channel:n,state:s,projectType:i,workspaceRoot:r}=o,{phase:a,renderedLines:d}=await bo(t,s.deploymentId,n);g("failed");let f=await Z(e.secrets);if(f)try{n.appendLine(""),n.appendLine("\u{1F916} Running AI diagnosis (Gemini 2.5 Flash)...");let p=await c.window.withProgress({location:c.ProgressLocation.Notification,title:"ShipShape: AI diagnosing failure..."},()=>Ze(f,{phase:a,logs:d,projectType:i,workspaceRoot:r,repoSlug:s.repoSlug}));await So(p,o);return}catch(p){let m=p instanceof $?`AI diagnosis failed (HTTP ${p.statusCode}): ${p.message}`:`AI diagnosis failed: ${p.message}`;n.appendLine(`\u26A0 ${m}`),n.appendLine("   Falling back to pattern-based diagnosis.")}else ko();let u=Do(d,a);await Co(u,n)}function ko(){c.window.showInformationMessage("Tip: Add a free Gemini API key to get AI-powered failure diagnosis and auto-fix.","Configure","Get a free key").then(o=>{o==="Configure"?c.commands.executeCommand("shipshape.configureAiApiKey"):o==="Get a free key"&&c.env.openExternal(c.Uri.parse("https://aistudio.google.com/apikey"))})}async function So(o,e){let{channel:t}=e;t.appendLine(""),t.appendLine(`\u{1F916} AI Diagnosis (${o.confidence} confidence \xB7 owner: ${o.owner})`),t.appendLine(`   ${o.summary}`),t.appendLine("");for(let i of o.rootCause.split(`
`))t.appendLine(`   ${i}`);o.fix?(t.appendLine(""),t.appendLine(`   \u{1F4A1} Proposed fix: ${o.fix.description}`),t.appendLine(`      File: ${o.fix.file}`)):(t.appendLine(""),t.appendLine("   \u2139  No safe auto-fix available \u2014 this issue needs a manual change"),t.appendLine("      (renames, multi-file changes, and low-confidence fixes are skipped for safety)."));let n=[];o.fix?n.push("Apply & redeploy","Preview fix","View logs"):(n.push("View logs"),(o.owner==="user"||o.owner==="config")&&n.push("Retry"));let s=await c.window.showErrorMessage(o.summary,...n);s==="Apply & redeploy"&&o.fix?await mt(o.fix,e):s==="Preview fix"&&o.fix?(await Po(o.fix),await c.window.showInformationMessage("Apply this fix, commit, push, and redeploy?",{modal:!0},"Apply & redeploy","Cancel")==="Apply & redeploy"&&await mt(o.fix,e)):s==="View logs"?t.show():s==="Retry"&&c.commands.executeCommand("shipshape.deploy")}async function Po(o){let e=xo(o.file),t=await c.workspace.openTextDocument({content:o.content,language:e});await c.window.showTextDocument(t,{preview:!0})}function xo(o){if(/\.json$/.test(o)||o===".locusbuild")return"json";if(/Dockerfile$/.test(o))return"dockerfile";if(/\.(ts|tsx)$/.test(o))return"typescript";if(/\.(js|jsx|mjs|cjs)$/.test(o))return"javascript";if(/\.ya?ml$/.test(o))return"yaml";if(/\.toml$/.test(o))return"toml"}async function mt(o,e){let{context:t,client:n,logProvider:s,channel:i,state:r,workspaceRoot:a}=e,d=c.Uri.file(gt.join(a.fsPath,o.file));i.appendLine(""),i.appendLine(`\u{1F527} Applying fix: ${o.description}`),i.appendLine(`   File: ${o.file}`);try{await c.workspace.fs.writeFile(d,new TextEncoder().encode(o.content))}catch(w){i.appendLine(`\u274C Could not write file: ${w.message}`),c.window.showErrorMessage(`ShipShape: Could not write ${o.file} \u2014 ${w.message}`);return}i.appendLine(`   Committing: ${o.commitMessage}`);let f=await c.window.withProgress({location:c.ProgressLocation.Notification,title:"ShipShape: Committing + pushing fix..."},()=>Fe(a,{filePath:d.fsPath,commitMessage:o.commitMessage}));if(!f.ok){i.appendLine(`\u274C Could not commit + push: ${f.reason}`),c.window.showErrorMessage(`ShipShape: Fix written but not pushed \u2014 ${f.reason}`);return}i.appendLine("\u2705 Pushed to GitHub. Triggering new deployment...");let u;try{u=await n.triggerDeployment(r.serviceId)}catch(w){i.appendLine(`\u274C Could not trigger deployment: ${w.message}`),c.window.showErrorMessage(`ShipShape: Could not trigger redeploy \u2014 ${w.message}`);return}let p={...r,deploymentId:u.id};await t.globalState.update("shipshape.lastDeploy",p),i.appendLine(`\u{1F680} New deployment: ${u.id}`),i.appendLine(""),g("building");let m=new AbortController,E=s.streamDeploymentLogs(u.id,i,m.signal).catch(w=>{w?.name!=="AbortError"&&i.appendLine(`\u26A0 Log stream disconnected: ${w?.message??w}`)});try{let w=await le(n,u.id,i);w.status==="healthy"?(i.appendLine(""),i.appendLine(`\u2705 Fix worked! Waiting ${H/1e3}s for service discovery...`),g("deploying"),await se(H),i.appendLine(`\u{1F310} Live at: ${r.serviceUrl}`),g("healthy",r.serviceUrl),c.commands.executeCommand("shipshape.refreshServices"),await c.window.showInformationMessage(`ShipShape: Fix applied \u2014 ${r.serviceName} is live at ${r.serviceUrl}`,"Open in Browser")==="Open in Browser"&&c.env.openExternal(c.Uri.parse(r.serviceUrl))):w.status==="failed"?(i.appendLine(""),i.appendLine("\u274C Fix did not resolve the issue. Re-diagnosing..."),m.abort(),await E,await vt({...e,state:p})):(i.appendLine(""),i.appendLine(`\u26A0 Deployment ended with status: ${w.status}`),g("idle"))}finally{m.abort(),await E}}async function Co(o,e){let t=[];o.kind==="platform"?t.push("Retry","View Logs"):t.push("View Logs","Retry");let n=await c.window.showErrorMessage(o.userMessage,...t);n==="View Logs"?e.show():n==="Retry"&&c.commands.executeCommand("shipshape.deploy")}function Do(o,e){let t=o.slice(-200).join(`
`);if(e==="building"||e==="build"||e==="queued"){if(/failed to resolve source metadata|not found.*dockerhub\/library|manifest.*not found/i.test(t)){let n=t.match(/dockerhub\/library\/([a-z0-9._-]+:[a-z0-9._-]+)/i);return{kind:"platform",userMessage:`Locus's image mirror does not carry \`${n?n[1]:"a base image"}\`. Swap your Dockerfile's FROM line to a mirrored image \u2014 node:20-alpine and most official language images work.`}}return/npm ERR!|Build failed|error TS\d+|Error: Cannot find module/i.test(t)?{kind:"user-code",userMessage:"Build failed in your project code. Check the logs \u2014 likely a missing dependency, TypeScript error, or Node build error."}:/DATABASE_URL.*(?:not set|undefined|required)|AUTH_SECRET.*(?:not set|required)/i.test(t)?{kind:"user-code",userMessage:"Build failed due to a missing environment variable. Add it via the env var manager and redeploy."}:/Nixpacks.*(?:failed|could not detect)/i.test(t)?{kind:"user-code",userMessage:"Locus could not auto-detect how to build your project. Add a Dockerfile or a .locusbuild config."}:{kind:"unknown",userMessage:"Build failed. Check the full logs below for the exact error."}}return e==="deploying"||e==="runtime"?/SIGTERM/i.test(t)&&/exit_code":\s*0|shutdown complete/i.test(t)?{kind:"user-code",userMessage:"Your container started and ran briefly, then was killed by Locus (SIGTERM). This is almost always a failed health check: the app is not responding on port 8080 at the configured healthCheck path. For Vite/React static sites, the server inside the container may be binding to the wrong port."}:/health.?check.*fail|unhealthy|task.*stopped.*health/i.test(t)?{kind:"user-code",userMessage:"Health check failed. Your container needs to respond 200 OK on port 8080 at the healthCheck path in your .locusbuild."}:/Error:.*(?:ENOENT|EADDRINUSE|EACCES)|uncaught exception|fatal error/i.test(t)?{kind:"user-code",userMessage:"Your container crashed at startup. Check the logs for the exception \u2014 typically a missing file, port in use, or permission issue."}:/caddy/i.test(t)&&/srv0/i.test(t)?{kind:"user-code",userMessage:"Locus built your static site with Caddy. It started but failed health checks \u2014 typically because Caddy binds to port 80/443 inside the container, not 8080. Add a Dockerfile or .locusbuild buildConfig that serves on PORT=8080."}:{kind:"user-code",userMessage:"Your container failed to stay healthy. Most common causes: (1) app not listening on port 8080, (2) app crashed at startup, (3) healthCheck path returns non-200. Check the logs below."}:/ECR.*unauthorized|registry.*timeout|rate.?limit/i.test(t)?{kind:"platform",userMessage:"Locus platform error talking to their image registry. Retry usually works."}:{kind:"unknown",userMessage:`Deployment failed in phase "${e}". Check the full logs below for details.`}}function Eo(o){T(o,"Deploy failed")}function Lo(){return c.workspace.workspaceFolders?.[0]?.uri}var I=h(require("vscode"));var v=h(require("vscode"));var Ce=class extends v.TreeItem{constructor(t){super(t.name,v.TreeItemCollapsibleState.Expanded);this.project=t;this.kind="project";this.contextValue="project",this.iconPath=new v.ThemeIcon("folder"),this.tooltip=`Region: ${t.region}
ID: ${t.id}`,this.description=t.region}},De=class extends v.TreeItem{constructor(t){super(t.name,v.TreeItemCollapsibleState.Expanded);this.environment=t;this.kind="environment";this.contextValue="environment",this.iconPath=new v.ThemeIcon("server-environment"),this.description=t.type,this.tooltip=`Environment: ${t.name} (${t.type})`}},C=class extends v.TreeItem{constructor(t,n){super(t.name,v.TreeItemCollapsibleState.Collapsed);this.service=t;this.domain=n;this.kind="service";this.contextValue="service",this.iconPath=wt(t.deploymentStatus);let i=[t.deploymentStatus??"not deployed"];t.autoDeploy&&i.push("auto $(sync)"),n&&i.push("\u{1F310}"),this.description=i.join(" \xB7 "),this.tooltip=[`Service: ${t.name}`,`Status: ${t.deploymentStatus??"not deployed"}`,`Auto-deploy: ${t.autoDeploy?"on":"off"}`,t.url?`URL: ${t.url}`:void 0,n?`\u{1F310} https://${n.domain}`:void 0,t.lastDeployedAt?`Last deploy: ${t.lastDeployedAt}`:void 0,"","Click to stream logs. Right-click for more actions."].filter(r=>r!==void 0).join(`
`),this.command={command:"shipshape.viewLogs",title:"View Logs",arguments:[this]}}},J=class extends v.TreeItem{constructor(t,n){super(`Deploy #${t.version}`,v.TreeItemCollapsibleState.None);this.deployment=t;this.serviceId=n;this.kind="deployment";this.contextValue="deployment",this.iconPath=wt(t.status),this.description=`${t.status} \u2014 ${To(t.createdAt)}`,this.tooltip=[`Deployment #${t.version}`,`Status: ${t.status}`,`Created: ${t.createdAt}`,t.durationMs!==null&&t.durationMs!==void 0?`Duration: ${Math.round(t.durationMs/1e3)}s`:void 0,"","Click to view logs. Right-click to roll back."].filter(s=>s!==void 0).join(`
`),this.command={command:"shipshape.viewLogs",title:"View Logs",arguments:[this]}}},Y=class extends v.TreeItem{constructor(t,n){super(t,v.TreeItemCollapsibleState.None);this.kind="message";n&&(this.iconPath=new v.ThemeIcon(n)),this.contextValue="message"}};function wt(o){switch(o){case"healthy":return new v.ThemeIcon("vm-running",new v.ThemeColor("charts.green"));case"deploying":case"building":case"queued":return new v.ThemeIcon("sync~spin",new v.ThemeColor("charts.yellow"));case"failed":return new v.ThemeIcon("error",new v.ThemeColor("charts.red"));case"rolled_back":return new v.ThemeIcon("history",new v.ThemeColor("charts.orange"));case"cancelled":return new v.ThemeIcon("circle-slash",new v.ThemeColor("charts.gray"));default:return new v.ThemeIcon("vm",new v.ThemeColor("charts.gray"))}}function To(o){let e=new Date(o).getTime();if(isNaN(e))return o;let t=Date.now()-e,n=Math.floor(t/1e3);if(n<60)return`${n}s ago`;let s=Math.floor(n/60);if(s<60)return`${s}m ago`;let i=Math.floor(s/60);return i<24?`${i}h ago`:`${Math.floor(i/24)}d ago`}var Ge=class{constructor(e){this.ttlMs=e;this.map=new Map}get(e){let t=this.map.get(e);if(t){if(Date.now()>t.expiresAt){this.map.delete(e);return}return t.value}}set(e,t){this.map.set(e,{value:t,expiresAt:Date.now()+this.ttlMs})}clear(){this.map.clear()}},Ee=class{constructor(e){this.client=e;this._onDidChangeTreeData=new v.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this.cache=new Ge(3e4)}refresh(){this.cache.clear(),this._onDidChangeTreeData.fire()}getTreeItem(e){return e}async getChildren(e){try{return e?e instanceof Ce?await this.loadEnvironments(e.project):e instanceof De?await this.loadServices(e.environment):e instanceof C?await this.loadDeployments(e.service):[]:await this.loadProjects()}catch(t){let n=t instanceof x?`Error: ${t.message}`:`Error: ${t.message}`;return[new Y(n,"warning")]}}async loadProjects(){let e=this.cache.get("projects"),t=e??await this.client.listProjects();return e||this.cache.set("projects",t),t.length===0?[new Y('No projects yet \u2014 run "ShipShape: Deploy Workspace"',"info")]:t.map(n=>new Ce(n))}async loadEnvironments(e){let t=`envs:${e.id}`,n=this.cache.get(t),s=n??await this.client.listEnvironments(e.id);return n||this.cache.set(t,s),s.length===0?[new Y("(no environments)","info")]:s.map(i=>new De(i))}async loadServices(e){let t=`svcs:${e.id}`,n=this.cache.get(t),s=n??await this.client.listServices(e.id);if(n||this.cache.set(t,s),s.length===0)return[new Y("(no services)","info")];let i=await this.loadDomainMap();return s.map(r=>new C(r,i.get(r.id)))}async loadDomainMap(){let e=this.cache.get("domainsByService");if(e)return e;let t=new Map;try{let n=await this.client.listDomains();for(let s of n)s.serviceId&&!t.has(s.serviceId)&&t.set(s.serviceId,s)}catch{}return this.cache.set("domainsByService",t),t}async loadDeployments(e){let t=`deps:${e.id}`,n=this.cache.get(t),s=n??await this.client.listDeployments(e.id,5);return n||this.cache.set(t,s),s.length===0?[new Y("(no deployments)","info")]:s.map(i=>new J(i,e.id))}};function yt(o,e){o.subscriptions.push(I.commands.registerCommand("shipshape.rollback",async t=>{let n,s;if(t instanceof J)n=t.deployment.id,s=`Deploy #${t.deployment.version}`;else if(t instanceof C)try{let d=(await e.listDeployments(t.service.id,10)).find(f=>f.status==="healthy"&&f.id!==t.service.lastDeploymentId);if(!d){I.window.showWarningMessage(`No previous healthy deployment found for ${t.service.name}.`);return}n=d.id,s=`Deploy #${d.version}`}catch(a){await T(a,"Failed to find previous deployment");return}if(!n){I.window.showInformationMessage("Right-click a deployment in the Services sidebar to roll back.");return}if(await I.window.showWarningMessage(`Roll back to ${s}? This will redeploy the previous image.`,{modal:!0},"Rollback")!=="Rollback")return;let r=await I.window.showInputBox({prompt:"Rollback reason (optional)",placeHolder:'e.g. "regression in latest deploy"'});try{await I.window.withProgress({location:I.ProgressLocation.Notification,title:`Rolling back to ${s}...`,cancellable:!1},async()=>{await e.rollbackDeployment(n,r||void 0)}),I.window.showInformationMessage("Rollback triggered. It may take a minute to apply."),await I.commands.executeCommand("shipshape.refreshServices")}catch(a){await T(a,"Rollback failed")}}))}var W=h(require("vscode"));function bt(o,e){o.subscriptions.push(W.commands.registerCommand("shipshape.openUrl",async t=>{let n;if(typeof t=="string"?n=t:t instanceof C&&(n=t.service.url),!n){W.window.showInformationMessage('No live URL yet. Deploy your workspace first with "ShipShape: Deploy Workspace".');return}await W.env.openExternal(W.Uri.parse(n))}))}var O=h(require("vscode"));function kt(o,e){o.subscriptions.push(O.commands.registerCommand("shipshape.restart",async t=>{if(!(t instanceof C)){O.window.showInformationMessage("Right-click a service in the Services sidebar to restart it.");return}if(await O.window.showWarningMessage(`Restart ${t.service.name}?`,{modal:!0},"Restart")==="Restart")try{await O.window.withProgress({location:O.ProgressLocation.Notification,title:`Restarting ${t.service.name}...`,cancellable:!1},async()=>{try{await e.restartService(t.service.id)}catch(s){if(s instanceof x&&s.statusCode===409){await e.redeployService(t.service.id);return}throw s}}),O.window.showInformationMessage(`${t.service.name} is restarting. It may take a minute to come back up.`),await O.commands.executeCommand("shipshape.refreshServices")}catch(s){await T(s,"Restart failed")}}))}var Q=h(require("vscode"));var Le=new Map;function St(o,e){let t=Le.get(o);if(t)return t;let n=Q.window.createOutputChannel(`ShipShape: ${e}`);return Le.set(o,n),n}function Pt(o,e){o.subscriptions.push(Q.commands.registerCommand("shipshape.viewLogs",async t=>{if(t instanceof J)return $o(e,t);if(t instanceof C)return Ro(e,t);Q.window.showInformationMessage("Right-click a service or deployment in the Services sidebar to view logs.")})),o.subscriptions.push({dispose(){for(let t of Le.values())t.dispose();Le.clear()}})}async function $o(o,e){let t=`dep:${e.deployment.id}`,n=St(t,`Deploy #${e.deployment.version}`);n.show(!0),n.appendLine(`\u2500\u2500 Deployment #${e.deployment.version} (${e.deployment.status}) \u2500\u2500`);try{let s=await o.getDeploymentLogs(e.deployment.id);n.appendLine(`Phase: ${s.phase}  Status: ${s.deploymentStatus}`),s.reason&&n.appendLine(`Reason: ${s.reason}`),n.appendLine("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");for(let i of s.logs)n.appendLine(re(i))}catch(s){let i=(s instanceof x,s.message);n.appendLine(`\u26A0 Failed to fetch logs: ${i}`)}}async function Ro(o,e){let t=`svc:${e.service.id}`,n=St(t,e.service.name);n.show(!0),n.appendLine(`\u2500\u2500 Streaming logs for ${e.service.name} \u2500\u2500`);let s=new AbortController;new Q.CancellationTokenSource().token.onCancellationRequested(()=>s.abort());try{await o.streamServiceLogs(e.service.id,r=>n.appendLine(r),s.signal)}catch(r){if(r.name==="AbortError")return;let a=(r instanceof x,r.message);n.appendLine(`\u26A0 Log stream ended: ${a}`)}}var l=h(require("vscode")),$e=h(require("path"));var Io=/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/?#]|$)/i,Ao=/(?:^|\s)([\w.-]+)\/([\w.-]+?)(?:\s|$)/,Te=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;function pe(o){let e=o.match(Io);if(e)return{repo:`${e[1]}/${e[2]}`,source:"url"}}function ue(o){let e=o.match(Ao);if(e&&Te.test(`${e[1]}/${e[2]}`))return{repo:`${e[1]}/${e[2]}`,source:"raw"}}var Bo={type:"OBJECT",properties:{services:{type:"OBJECT",description:"Map from service name to config. Service names must be short, lowercase, alphanumeric.",additionalProperties:{type:"OBJECT",properties:{path:{type:"STRING"},port:{type:"INTEGER"},healthCheck:{type:"STRING"},env:{type:"OBJECT",nullable:!0,additionalProperties:{type:"STRING"}}},required:["path","port","healthCheck"]}},addons:{type:"OBJECT",nullable:!0,additionalProperties:{type:"OBJECT",properties:{type:{type:"STRING",enum:["postgres","redis"]}},required:["type"]}}},required:["services"]},Ct=`You are a Locus deployment config generator.
Output ONLY valid JSON in .locusbuild format. No explanation. No markdown fences.
Schema:
{
  "services": {
    "<name>": { "path": string, "port": 8080, "healthCheck": string, "env"?: {} }
  },
  "addons"?: {
    "<name>": { "type": "postgres" | "redis" }
  }
}
Rules:
- port is always 8080
- Use \${{addonName.DATABASE_URL}} for database connections
- Use \${{serviceName.URL}} for cross-service references
- healthCheck should be "/health" for APIs, "/" for frontends
- Do NOT include a "buildConfig" field \u2014 it's not supported in .locusbuild
- Service names must be short lowercase alphanumeric (e.g. "web", "api", "worker")`;async function Mo(o){try{let e=await fetch(`https://api.github.com/repos/${o}`,{headers:{Accept:"application/vnd.github+json"}});if(!e.ok)return;let t=await e.json();return{language:t.language,description:t.description??void 0,defaultBranch:t.default_branch}}catch{return}}function jo(o){let e=[];return o.language&&e.push(`primary language = ${o.language}`),o.defaultBranch&&e.push(`default branch = ${o.defaultBranch}`),o.description&&e.push(`description = ${o.description}`),e.length===0?"":`

Repository hints: ${e.join(", ")}. Use these to pick sensible service types and health check paths.`}async function Oo(o){try{let e=l.Uri.file($e.join(o.fsPath,"package.json")),t=await l.workspace.fs.readFile(e),n=JSON.parse(new TextDecoder().decode(t)),s=n.dependencies?Object.keys(n.dependencies).slice(0,30).join(", "):"",i=n.scripts?JSON.stringify(n.scripts):"";return!s&&!i?"":`

Workspace package.json hints: dependencies = [${s}], scripts = ${i}. Use these to pick sensible service types and health check paths.`}catch{return""}}function Dt(o,e){let t={services:{}};for(let[n,s]of Object.entries(o.services??{})){let{path:i,port:r,healthCheck:a,env:d}=s;"buildConfig"in s&&e.appendLine(`\u26A0 Stripped unsupported "buildConfig" from service "${n}" (Rule 17).`);let f=r;f!==8080&&(e.appendLine(`\u26A0 AI emitted port ${f} for service "${n}"; forcing to 8080 (Rule 6).`),f=8080),t.services[n]={path:i??".",port:f,healthCheck:a??"/",...d?{env:d}:{}}}if(o.addons){t.addons={};for(let[n,s]of Object.entries(o.addons))(s?.type==="postgres"||s?.type==="redis")&&(t.addons[n]={type:s.type})}return t}function Et(o,e,t){o.subscriptions.push(l.commands.registerCommand("shipshape.deployNL",async()=>{try{await No(o,e,t)}catch(n){await T(n,"AI Deploy failed"),g("failed")}}))}async function No(o,e,t){if(!await Uo(o,e))return;let s=await Z(o.secrets);if(!s&&(s=await fe(o.secrets,"AI deploy needs a Gemini API key"),!s))return;let i=await l.window.showInputBox({prompt:"Describe what you want to deploy",placeHolder:"e.g. Deploy github.com/me/my-next-app with a Postgres DB",ignoreFocusOut:!0});if(!i)return;await l.window.withProgress({location:l.ProgressLocation.Notification,title:"ShipShape: Verifying credentials..."},async()=>{await e.verifyOrRefreshToken()});let r=await e.getBillingBalance();if(r.creditBalance<.25){await l.window.showErrorMessage(`Insufficient Locus credits ($${r.creditBalance.toFixed(2)}). Each service costs $0.25/month.`,"Add Credits")==="Add Credits"&&l.env.openExternal(l.Uri.parse("https://beta.buildwithlocus.com/billing"));return}let a=l.workspace.workspaceFolders?.[0]?.uri,d=a?await ae(a):void 0,f=pe(i),u=!a&&!f?ue(i):void 0,p=f??u;if(!!p&&(!d||p.repo.toLowerCase()!==d.toLowerCase())&&p){await xt(o,e,t,{aiKey:s,description:i,repo:p.repo});return}if(!a){let E=await l.window.showInputBox({prompt:"No workspace open. Paste a GitHub repo URL or owner/repo to deploy remotely.",placeHolder:"https://github.com/owner/repo or owner/repo",ignoreFocusOut:!0,validateInput:y=>y?pe(y)??ue(` ${y} `)?null:"Could not parse a GitHub repo":"Required"});if(!E)return;let w=pe(E)?.repo??ue(` ${E} `)?.repo;if(!w)return;await xt(o,e,t,{aiKey:s,description:i,repo:w});return}await _o(o,e,t,{aiKey:s,description:i,workspaceRoot:a})}async function xt(o,e,t,n){let{aiKey:s,description:i,repo:r}=n;if(!Te.test(r)){l.window.showErrorMessage(`ShipShape: "${r}" doesn't look like a valid GitHub owner/repo.`);return}if(!(await e.checkRepoAccess(r)).accessible){await l.window.showErrorMessage("This repo isn't connected. Visit https://beta.buildwithlocus.com/integrations to connect GitHub.","Open integrations")==="Open integrations"&&l.env.openExternal(l.Uri.parse("https://beta.buildwithlocus.com/integrations"));return}let d=await Mo(r),f=Ct;d&&(f+=jo(d));let u=await Tt(s,f,i);if(!u)return;let p=r.split("/")[1],m=t.getOrCreateChannel(p);m.show(!0),m.appendLine(`\u{1F916} AI deploy \u2014 ${new Date().toISOString()}`),m.appendLine(`   Repo: ${r}`),d?.language&&m.appendLine(`   Language hint: ${d.language}`),m.appendLine("");let E=Dt(u,m),w=await $t(e,E,m);if(!w.ok){await Rt(o,w.errors);return}let y=await l.workspace.openTextDocument({content:JSON.stringify(E,null,2),language:"json"});await l.window.showTextDocument(y,{preview:!1});let P=await l.window.showInformationMessage(`Deploy ${r} with this config?`,{modal:!0},"Deploy","Edit First","Cancel");if(P==="Edit First"){l.window.showInformationMessage('Edit the preview, then run "ShipShape: Deploy with AI" again (the config will be regenerated from your next prompt).');return}if(P!=="Deploy")return;g("building");let _=await l.window.withProgress({location:l.ProgressLocation.Notification,title:`ShipShape: Creating ${p}...`},async()=>{let k=l.workspace.getConfiguration("shipshape").get("defaultRegion")??"us-east-1",U={...E,region:k};return e.fromLocusbuild({name:p,repo:r,branch:d?.defaultBranch??"main",locusbuild:U})});await Lt(o,e,t,m,_,p)}async function _o(o,e,t,n){let{aiKey:s,description:i,workspaceRoot:r}=n,a=Ct+await Oo(r),d=await Tt(s,a,i);if(!d)return;let f=$e.basename(r.fsPath),u=t.getOrCreateChannel(f);u.show(!0),u.appendLine(`\u{1F916} AI deploy \u2014 ${new Date().toISOString()}`),u.appendLine(`   Workspace: ${r.fsPath}`),u.appendLine("");let p=Dt(d,u),m=await $t(e,p,u);if(!m.ok){await Rt(o,m.errors);return}if(await Pe(r)){let S=await ce(r),M=await l.workspace.openTextDocument({content:JSON.stringify(p,null,2),language:"json"});await l.commands.executeCommand("vscode.diff",S,M.uri,".locusbuild \u2014 AI Generated")}else{let S=await l.workspace.openTextDocument({content:JSON.stringify(p,null,2),language:"json"});await l.window.showTextDocument(S,{preview:!1})}let w=await l.window.showInformationMessage("Use this AI-generated .locusbuild?",{modal:!0},"Deploy","Edit First","Cancel");if(w==="Edit First"){l.window.showInformationMessage('Adjust the config, then re-run "ShipShape: Deploy with AI" when ready.');return}if(w!=="Deploy")return;try{await Se(r,p),u.appendLine("\u2714 Wrote .locusbuild to workspace root")}catch(S){u.appendLine(`\u26A0 Could not write .locusbuild: ${S.message}`)}let y=l.workspace.getConfiguration("shipshape"),P=y.get("shipshape.githubRepo")??y.get("githubRepo");if(!P||!Te.test(P)){let S=await ae(r);if(S&&await l.window.showInformationMessage(`ShipShape: Deploy from GitHub repo "${S}"?`,"Yes","Use a different repo")==="Yes"&&(P=S,await y.update("githubRepo",S,l.ConfigurationTarget.Workspace)),!P){let M=await l.window.showInputBox({prompt:"GitHub repo \u2014 paste the URL or enter owner/repo",placeHolder:"e.g. https://github.com/owner/repo  or  owner/repo",ignoreFocusOut:!0,validateInput:F=>F?pe(F)??ue(` ${F} `)?null:"Could not parse a GitHub repo":"Required"});if(!M||(P=pe(M)?.repo??ue(` ${M} `)?.repo,!P))return;await y.update("githubRepo",P,l.ConfigurationTarget.Workspace)}}if(!Te.test(P)){l.window.showErrorMessage(`ShipShape: "${P}" is not a valid GitHub owner/repo.`);return}let _=P.split("/")[1],U=(await e.listProjects()).find(S=>S.name===_||S.name===P);if(U&&await l.window.showWarningMessage(`A project named "${U.name}" already exists. AI deploy always creates fresh via from-locusbuild \u2014 continue anyway? The backend may reject a duplicate name.`,{modal:!0},"Continue","Cancel")!=="Continue")return;g("building");let ge=y.get("defaultRegion")??"us-east-1",b=await l.window.withProgress({location:l.ProgressLocation.Notification,title:`ShipShape: Creating ${_}...`},async()=>e.fromLocusbuild({name:_,repo:P,branch:"main",locusbuild:{...p,region:ge}}));await Lt(o,e,t,u,b,_)}async function Lt(o,e,t,n,s,i){let r=s.services[0],a=s.deployments[0];if(!r||!a){l.window.showErrorMessage("Deployment kicked off but response was malformed."),g("failed");return}let d={projectId:s.project.id,environmentId:s.environment.id,serviceId:r.id,serviceName:r.name,serviceUrl:r.url,deploymentId:a.id,repoSlug:i,serviceIds:s.services.map(p=>p.id)};await o.globalState.update("shipshape.lastDeploy",d),n.appendLine("\u{1F680} Deployment started"),n.appendLine(`   Project:    ${s.project.name} (${s.project.id})`),n.appendLine(`   Service:    ${r.name} (${r.id})`),n.appendLine(`   Deployment: ${a.id}`),n.appendLine(""),g("building");let f=new AbortController,u=t.streamDeploymentLogs(a.id,n,f.signal).catch(p=>{p?.name!=="AbortError"&&n.appendLine(`\u26A0 Log stream disconnected: ${p?.message??p}`)});try{let p=await le(e,a.id,n);if(p.status==="healthy"){n.appendLine(""),n.appendLine(`\u2705 Deployment healthy. Waiting ${H/1e3}s for service discovery...`),g("deploying"),await se(H),n.appendLine(`\u{1F310} Live at: ${r.url}`),g("healthy",r.url),l.commands.executeCommand("shipshape.refreshServices");let m=await l.window.showInformationMessage(`ShipShape: ${r.name} is live at ${r.url}`,"Open in Browser","View Logs");m==="Open in Browser"?l.env.openExternal(l.Uri.parse(r.url)):m==="View Logs"&&n.show()}else if(p.status==="failed"){n.appendLine(""),n.appendLine("\u274C Deployment failed.");try{let m=await e.getDeploymentLogs(a.id);m.reason&&n.appendLine(`Reason: ${m.reason}`);for(let E of(m.logs??[]).slice(-100))n.appendLine(typeof E=="string"?E:JSON.stringify(E))}catch{}g("failed"),l.window.showErrorMessage("ShipShape: AI deploy failed. See the output channel for logs.")}else n.appendLine(`\u26A0 Deployment ended with status: ${p.status}`),g("idle")}finally{f.abort(),await u}}async function Uo(o,e){let t=await z(o.secrets);if(t)return t.key;let n=await l.window.showInputBox({prompt:"Enter your Locus Build API key",password:!0,placeHolder:"claw_...",ignoreFocusOut:!0,validateInput:s=>s&&!s.startsWith("claw_")?"Key must start with claw_":null});if(n)return await o.secrets.store("shipshape.buildApiKey",n),e.clearTokenCache(),n}async function Tt(o,e,t){let n;try{n=await l.window.withProgress({location:l.ProgressLocation.Notification,title:"ShipShape: Generating config with Gemini..."},()=>ye(o,{system:e,userMessage:t,maxTokens:4e3,jsonMode:!0,responseSchema:Bo}))}catch(s){s instanceof $?l.window.showErrorMessage(`ShipShape: Gemini error (${s.statusCode}): ${s.message}`):l.window.showErrorMessage(`ShipShape: Gemini error: ${s.message}`);return}try{return be(n)}catch(s){l.window.showErrorMessage(`ShipShape: Could not parse AI response as JSON. ${s.message}. First 300 chars: ${n.slice(0,300)}`);return}}async function $t(o,e,t){try{let n=await o.verifyLocusbuild(e);if(!n.valid){t.appendLine("\u274C verify-locusbuild rejected the generated config:");for(let s of n.errors)t.appendLine(`   \u2022 ${s}`);return{ok:!1,errors:n.errors}}return t.appendLine("\u2714 verify-locusbuild passed."),{ok:!0}}catch(n){return t.appendLine(`\u26A0 verify-locusbuild call failed: ${n.message}. Continuing.`),{ok:!0}}}async function Rt(o,e){await l.window.showErrorMessage(`ShipShape: The AI-generated config failed validation. Errors: ${e.slice(0,3).join("; ")}`,"Retry")==="Retry"&&l.commands.executeCommand("shipshape.deployNL")}var A=h(require("vscode"));function It(o,e){o.subscriptions.push(A.commands.registerCommand("shipshape.toggleAutoDeploy",async t=>{try{await Fo(e,t)}catch(n){await T(n,"Toggle auto-deploy failed")}}))}async function Fo(o,e){let t;if(e instanceof C)t=e.service;else if(t=await Go(o),!t)return;let n=!!t.autoDeploy,s=n?`Disable auto-deploy for ${t.name}?`:`Enable auto-deploy for ${t.name}? The service will redeploy automatically on every push to the configured branch.`;await A.window.showInformationMessage(s,{modal:!0},n?"Disable":"Enable")&&(await A.window.withProgress({location:A.ProgressLocation.Notification,title:`ShipShape: ${n?"Disabling":"Enabling"} auto-deploy...`},async()=>o.updateService(t.id,{autoDeploy:!n})),await A.commands.executeCommand("shipshape.refreshServices"),A.window.showInformationMessage(`Auto-deploy ${n?"disabled":"enabled"} for ${t.name}.`))}async function Go(o){let e=await o.listProjects();if(e.length===0){A.window.showInformationMessage("No projects yet.");return}let t=[];for(let s of e){let i=await o.listEnvironments(s.id);for(let r of i){let a=await o.listServices(r.id);for(let d of a)t.push({label:d.name,description:`${s.name}/${r.name}`,detail:d.autoDeploy?"auto-deploy: on":"auto-deploy: off",service:{id:d.id,name:d.name,autoDeploy:d.autoDeploy}})}}if(t.length===0){A.window.showInformationMessage("No services found.");return}return(await A.window.showQuickPick(t,{title:"ShipShape: Toggle auto-deploy",placeHolder:"Pick a service",ignoreFocusOut:!0}))?.service}var B=h(require("vscode"));var Re=class{constructor(e,t){this.client=e;this.extensionUri=t;this.panels=new Map}show(e,t){let n=this.panels.get(e);if(n){n.reveal();return}let s=B.window.createWebviewPanel("shipshape.envVars",`Env Vars \u2014 ${t}`,B.ViewColumn.Active,{enableScripts:!0,retainContextWhenHidden:!0});s.iconPath=B.Uri.joinPath(this.extensionUri,"media","icons","shipshape.svg"),s.webview.html=this.renderHtml(s.webview,t),this.panels.set(e,s),s.onDidDispose(()=>this.panels.delete(e)),s.webview.onDidReceiveMessage(async i=>{try{i.type==="load"?await this.handleLoad(s,e):i.type==="save"&&await this.handleSave(s,e,t,i.variables)}catch(r){let a=(r instanceof x,r.message);this.post(s,{type:"error",message:a})}})}async handleLoad(e,t){let n=await this.client.getResolvedVariables(t);this.post(e,{type:"loaded",variables:n})}async handleSave(e,t,n,s){await B.window.withProgress({location:B.ProgressLocation.Notification,title:`Saving env vars for ${n}...`,cancellable:!1},async i=>{i.report({message:"Writing variables..."}),await this.client.setVariables(t,s),i.report({message:"Triggering redeploy..."}),await this.client.triggerDeployment(t)}),this.post(e,{type:"saved",success:!0}),B.window.showInformationMessage(`Env vars saved. ${n} is redeploying \u2014 watch the sidebar.`),B.commands.executeCommand("shipshape.refreshServices")}post(e,t){e.webview.postMessage(t)}renderHtml(e,t){let n=qo();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${["default-src 'none'",`style-src ${e.cspSource} 'unsafe-inline'`,`script-src 'nonce-${n}'`].join("; ")}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Env Vars \u2014 ${At(t)}</title>
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
  <div class="subtitle">${At(t)}</div>

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

  <script nonce="${n}">
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
</html>`}};function qo(){let o="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)o+=e.charAt(Math.floor(Math.random()*e.length));return o}function At(o){return o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var L=h(require("vscode"));var qe="shipshape.pendingDomains",Ie=class{constructor(e,t,n){this.client=e;this.extensionUri=t;this.globalState=n;this.panels=new Map}getPendingMap(){return this.globalState.get(qe,{})}async setPending(e,t){let n=this.getPendingMap();n[e]=t,await this.globalState.update(qe,n)}async clearPending(e){let t=this.getPendingMap();t[e]&&(delete t[e],await this.globalState.update(qe,t))}show(e,t,n){let s=this.panels.get(e);if(s){s.reveal();return}let i=L.window.createWebviewPanel("shipshape.domains",`Domain \u2014 ${t}`,L.ViewColumn.Active,{enableScripts:!0,retainContextWhenHidden:!0});i.iconPath=L.Uri.joinPath(this.extensionUri,"media","icons","shipshape.svg"),i.webview.html=this.renderHtml(i.webview,t),this.panels.set(e,i),i.onDidDispose(()=>this.panels.delete(e)),i.webview.onDidReceiveMessage(async r=>{try{r.type==="load"?await this.handleLoad(i,e,n):r.type==="create"?await this.handleCreate(i,e,n,r.domain):r.type==="check"?await this.handleCheck(i,e,n,r.domainId):r.type==="attach"?await this.handleAttach(i,e,n,r.domainId):r.type==="remove"?await this.handleRemove(i,e,n,r.domainId):r.type==="openExternal"?await L.env.openExternal(L.Uri.parse(r.url)):r.type==="copy"&&(await L.env.clipboard.writeText(r.value),this.post(i,{type:"progress",message:"Copied to clipboard."}))}catch(a){let{message:d}=je(a,"Domain");this.post(i,{type:"error",message:d})}})}async handleLoad(e,t,n){let s=await this.findDomainForService(t,n);this.post(e,{type:"state",domain:s,step:me(s)})}async handleCreate(e,t,n,s){let i=s.trim().toLowerCase();if(!Vo(i)){this.post(e,{type:"error",message:"Enter a valid domain, e.g. api.example.com (no protocol, no trailing dot)."});return}let r=await this.findDomainForService(t,n);if(r){this.post(e,{type:"error",message:"This service already has a domain. Remove it first to add a new one."}),this.post(e,{type:"state",domain:r,step:me(r)});return}this.post(e,{type:"progress",message:"Registering domain..."});let a=await this.client.createDomain(i,n);await this.setPending(t,a.id),this.post(e,{type:"state",domain:a,step:me(a)})}async handleCheck(e,t,n,s){this.post(e,{type:"progress",message:"Checking DNS and SSL validation..."}),await this.client.verifyDomain(s);let i=await this.client.getDomain(s);this.post(e,{type:"state",domain:i,step:me(i),lastCheckedAt:new Date().toISOString()})}async handleAttach(e,t,n,s){this.post(e,{type:"progress",message:"Attaching domain to service..."});let i=await this.client.attachDomain(s,t);await this.clearPending(t),this.post(e,{type:"state",domain:i,step:me(i)}),L.window.showInformationMessage(`Domain attached: ${i.domain}`),L.commands.executeCommand("shipshape.refreshServices")}async handleRemove(e,t,n,s){if(await L.window.showWarningMessage("Remove this domain? It will be detached from the service and deleted. You will need to re-add it to restore.",{modal:!0},"Remove")!=="Remove"){this.post(e,{type:"progress",message:""});return}this.post(e,{type:"progress",message:"Detaching..."});try{await this.client.detachDomain(s)}catch(r){if(!(r instanceof x&&(r.statusCode===409||r.statusCode===400)))throw r}this.post(e,{type:"progress",message:"Deleting..."}),await this.client.deleteDomain(s),await this.clearPending(t),this.post(e,{type:"state",domain:void 0,step:"empty"}),L.window.showInformationMessage("Domain removed."),L.commands.executeCommand("shipshape.refreshServices")}async findDomainForService(e,t){let n=await this.client.listDomainsByProject(t),s=n.find(a=>a.serviceId===e);if(s)return s;let i=this.getPendingMap()[e];if(!i)return;let r=n.find(a=>a.id===i);if(!r){await this.clearPending(e);return}if(r.serviceId&&r.serviceId!==e){await this.clearPending(e);return}return r}post(e,t){e.webview.postMessage(t)}renderHtml(e,t){let n=Ho();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${["default-src 'none'",`style-src ${e.cspSource} 'unsafe-inline'`,`script-src 'nonce-${n}'`].join("; ")}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Domain \u2014 ${Bt(t)}</title>
  <style>
    :root { color-scheme: var(--vscode-color-scheme); }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 4px 0; }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .section { margin-bottom: 20px; }
    .warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
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
    button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
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
      padding: 2px 6px;
      border-color: transparent;
    }
    button.icon:hover:not(:disabled) {
      background: var(--vscode-toolbar-hoverBackground);
    }
    input[type="text"] {
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
    input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 6px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td {
      padding: 6px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85rem;
      word-break: break-all;
    }
    td.actions { width: 48px; text-align: right; }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .pill.pending    { background: var(--vscode-charts-yellow, #cca700); color: #000; }
    .pill.validating { background: var(--vscode-charts-yellow, #cca700); color: #000; }
    .pill.validated  { background: var(--vscode-charts-green, #388a34); color: #fff; }
    .pill.failed     { background: var(--vscode-charts-red, #c72e0f); color: #fff; }
    .status {
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
      min-height: 1.2em;
    }
    .status.error { color: var(--vscode-errorForeground); }
    .attached-badge {
      font-size: 1.4rem;
      color: var(--vscode-charts-green, #388a34);
      margin-right: 6px;
    }
    .link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .link:hover { text-decoration: underline; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.8rem; }
    .hidden { display: none !important; }
    .cell-value { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Custom Domain</h1>
  <div class="subtitle" id="subtitle">${Bt(t)}</div>

  <!-- Empty state: add a new domain -->
  <div id="state-empty" class="section hidden">
    <div class="row">
      <input type="text" id="domain-input" placeholder="api.example.com" spellcheck="false" autocapitalize="off" />
    </div>
    <div class="row">
      <button id="add-btn">Add Domain</button>
      <button id="purchase-btn" class="secondary">Purchase a new domain</button>
    </div>
    <div class="warning">
      \u26A0 Already own this domain? Cloudflare users: set DNS to <strong>DNS-only (gray cloud)</strong> \u2014 orange-cloud proxying breaks SSL validation.
    </div>
  </div>

  <!-- DNS pending state -->
  <div id="state-pending" class="section hidden">
    <div class="row">
      <span id="pending-domain" style="font-weight:600;font-size:1rem;"></span>
      <span id="pending-pill" class="pill pending">Pending</span>
    </div>
    <p class="meta">Add these DNS records at your registrar, then click <strong>Check Now</strong>.</p>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Name</th>
          <th>Value</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="dns-rows"></tbody>
    </table>
    <div class="row" style="margin-top: 12px;">
      <button id="check-btn">Check Now</button>
      <button id="attach-btn" class="secondary" disabled>Attach to Service</button>
      <button id="remove-pending-btn" class="secondary">Remove</button>
    </div>
    <div class="meta" id="last-checked"></div>
    <div class="warning" style="margin-top: 12px;">
      \u26A0 Cloudflare users: set DNS to <strong>DNS-only (gray cloud)</strong> \u2014 orange-cloud proxying breaks SSL validation.
    </div>
  </div>

  <!-- Attached state -->
  <div id="state-attached" class="section hidden">
    <div class="row">
      <span class="attached-badge">\u2713</span>
      <a class="link" id="attached-link"></a>
      <span class="pill validated">Validated</span>
    </div>
    <p class="meta" id="attached-meta"></p>
    <div class="row">
      <button id="remove-btn" class="secondary">Remove Domain</button>
    </div>
  </div>

  <div id="status" class="status"></div>

  <script nonce="${n}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');

    const empty = document.getElementById('state-empty');
    const pending = document.getElementById('state-pending');
    const attached = document.getElementById('state-attached');

    const domainInput = document.getElementById('domain-input');
    const addBtn = document.getElementById('add-btn');
    const purchaseBtn = document.getElementById('purchase-btn');

    const pendingDomainEl = document.getElementById('pending-domain');
    const pendingPill = document.getElementById('pending-pill');
    const dnsRows = document.getElementById('dns-rows');
    const checkBtn = document.getElementById('check-btn');
    const attachBtn = document.getElementById('attach-btn');
    const removePendingBtn = document.getElementById('remove-pending-btn');
    const lastCheckedEl = document.getElementById('last-checked');

    const attachedLink = document.getElementById('attached-link');
    const attachedMeta = document.getElementById('attached-meta');
    const removeBtn = document.getElementById('remove-btn');

    let currentDomain = null;
    const FQDN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$/;

    function show(which) {
      empty.classList.toggle('hidden', which !== 'empty');
      pending.classList.toggle('hidden', which !== 'dns-pending');
      attached.classList.toggle('hidden', which !== 'attached');
    }

    function setStatus(msg, isError) {
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('error', !!isError);
    }

    function setButtonsDisabled(disabled) {
      [addBtn, purchaseBtn, checkBtn, attachBtn, removePendingBtn, removeBtn].forEach((b) => {
        if (!b) return;
        // attachBtn has its own gate \u2014 re-evaluated below
        b.disabled = disabled;
      });
    }

    function renderEmpty() {
      show('empty');
      domainInput.value = '';
      setStatus('');
    }

    function renderPending(domain, lastCheckedAt) {
      show('dns-pending');
      pendingDomainEl.textContent = domain.domain;
      const vs = domain.validationStatus || 'pending';
      pendingPill.className = 'pill ' + vs;
      pendingPill.textContent = vs.charAt(0).toUpperCase() + vs.slice(1);

      dnsRows.innerHTML = '';
      if (domain.cnameTarget) {
        addDnsRow('CNAME', domain.domain, domain.cnameTarget, 'Routing');
      }
      const records = domain.validationRecords || [];
      for (const r of records) {
        addDnsRow(r.type || 'CNAME', r.name, r.value, 'SSL validation');
      }

      attachBtn.disabled = vs !== 'validated';
      lastCheckedEl.textContent = lastCheckedAt
        ? 'Last checked: ' + new Date(lastCheckedAt).toLocaleString()
        : '';
    }

    function addDnsRow(type, name, value, label) {
      const tr = document.createElement('tr');
      const typeTd = document.createElement('td');
      typeTd.textContent = type;
      const nameTd = document.createElement('td');
      nameTd.className = 'cell-value';
      const nameSpan = document.createElement('div');
      nameSpan.textContent = name;
      const nameLabel = document.createElement('div');
      nameLabel.className = 'meta';
      nameLabel.textContent = label;
      nameTd.appendChild(nameSpan);
      nameTd.appendChild(nameLabel);
      const valueTd = document.createElement('td');
      valueTd.className = 'cell-value';
      valueTd.textContent = value;
      const actTd = document.createElement('td');
      actTd.className = 'actions';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'icon';
      copyBtn.type = 'button';
      copyBtn.title = 'Copy value';
      copyBtn.textContent = '\u{1F4CB}';
      copyBtn.onclick = () => vscode.postMessage({ type: 'copy', value });
      actTd.appendChild(copyBtn);
      tr.appendChild(typeTd);
      tr.appendChild(nameTd);
      tr.appendChild(valueTd);
      tr.appendChild(actTd);
      dnsRows.appendChild(tr);
    }

    function renderAttached(domain) {
      show('attached');
      const url = 'https://' + domain.domain;
      attachedLink.textContent = url;
      attachedLink.onclick = () => vscode.postMessage({ type: 'openExternal', url });
      attachedMeta.textContent = 'Domain is live and attached to this service.';
    }

    addBtn.onclick = () => {
      const v = (domainInput.value || '').trim().toLowerCase();
      if (!FQDN.test(v)) {
        setStatus('Enter a valid domain, e.g. api.example.com (lowercase, no protocol, no trailing dot).', true);
        return;
      }
      setButtonsDisabled(true);
      setStatus('Registering domain...');
      vscode.postMessage({ type: 'create', domain: v });
    };

    purchaseBtn.onclick = () => {
      vscode.postMessage({ type: 'openExternal', url: 'https://beta.buildwithlocus.com/domains' });
    };

    checkBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Checking DNS...');
      vscode.postMessage({ type: 'check', domainId: currentDomain.id });
    };

    attachBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Attaching...');
      vscode.postMessage({ type: 'attach', domainId: currentDomain.id });
    };

    removePendingBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Removing...');
      vscode.postMessage({ type: 'remove', domainId: currentDomain.id });
    };

    removeBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Removing...');
      vscode.postMessage({ type: 'remove', domainId: currentDomain.id });
    };

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'state') {
        currentDomain = msg.domain || null;
        setButtonsDisabled(false);
        if (msg.step === 'empty' || !currentDomain) {
          renderEmpty();
        } else if (msg.step === 'dns-pending') {
          renderPending(currentDomain, msg.lastCheckedAt);
        } else if (msg.step === 'attached') {
          renderAttached(currentDomain);
        }
        setStatus('');
      } else if (msg.type === 'progress') {
        setStatus(msg.message);
      } else if (msg.type === 'error') {
        setButtonsDisabled(false);
        setStatus(msg.message, true);
      }
    });

    // Initial load
    setStatus('Loading...');
    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`}};function me(o){return o?o.serviceId&&o.validationStatus==="validated"?"attached":"dns-pending":"empty"}function Vo(o){return/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(o)}function Ho(){let o="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)o+=e.charAt(Math.floor(Math.random()*e.length));return o}function Bt(o){return o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}var N=h(require("vscode"));async function Mt(o,e,t,n){try{let s;if(n instanceof C?s=n.service:s=await Wo(e),!s)return;let i=await N.window.showQuickPick([{label:"$(globe) BYOD \u2014 I already own this domain",description:"Add your existing domain, add DNS records, then attach",value:"byod"},{label:"$(link-external) Purchase a new domain",description:"Opens the Locus dashboard in your browser",value:"purchase"}],{title:"Add Custom Domain",placeHolder:`Target service: ${s.name}`});if(!i)return;if(i.value==="purchase"){await N.env.openExternal(N.Uri.parse("https://beta.buildwithlocus.com/domains")),N.window.showInformationMessage('In-editor domain purchase is not supported \u2014 purchase in the dashboard, then return here and choose "BYOD" to wire it up.');return}t.show(s.id,s.name,s.projectId)}catch(s){await T(s,"Add Custom Domain")}}async function Wo(o){let e=await o.listProjects();if(e.length===0){N.window.showInformationMessage('No projects yet \u2014 deploy a workspace first with "ShipShape: Deploy Workspace".');return}let t=[];for(let s of e){let i=[];try{i=await o.listEnvironments(s.id)}catch{continue}for(let r of i){let a=[];try{a=await o.listServices(r.id)}catch{continue}for(let d of a)t.push({label:`$(server-process) ${d.name}`,description:`${s.name} / ${r.name}`,detail:d.url||void 0,service:d,project:s,environment:r})}}if(t.length===0){N.window.showInformationMessage("No services found across your projects.");return}return(await N.window.showQuickPick(t,{title:"Select a service to add a domain to",placeHolder:"Pick a service",matchOnDescription:!0,matchOnDetail:!0}))?.service}var K=h(require("vscode"));async function jt(o){try{let e=await o.listDomains();if(e.length===0){K.window.showInformationMessage('No domains in this workspace. Add one from a service via "ShipShape: Add Custom Domain".');return}let t=await K.window.showQuickPick(e.map(Ko),{title:`Domains in workspace (${e.length})`,placeHolder:"Pick a domain to remove",matchOnDescription:!0,matchOnDetail:!0});if(!t)return;let n=t.domain;if(await K.window.showWarningMessage(`Remove "${n.domain}"?`,{modal:!0,detail:"This detaches it from any service and deletes it permanently."},"Remove")!=="Remove")return;await K.window.withProgress({location:K.ProgressLocation.Notification,title:`Removing ${n.domain}\u2026`},async()=>{try{await o.detachDomain(n.id)}catch(i){if(!(i instanceof x&&(i.statusCode===400||i.statusCode===409)))throw i}await o.deleteDomain(n.id)}),K.window.showInformationMessage(`Removed ${n.domain}.`)}catch(e){await T(e,"Manage Domains")}}function Ko(o){let e=zo(o),t=o.serviceId?`attached to service ${o.serviceId}`:"unattached";return{label:`$(globe) ${o.domain}`,description:e,detail:t,domain:o}}function zo(o){return o.serviceId&&o.certificateValidated?"$(check) attached":o.validationStatus==="validated"?"$(pass) validated \u2014 not attached":o.validationStatus==="failed"?"$(error) failed":o.validationStatus==="validating"?"$(sync~spin) validating":"$(clock) pending"}function Yo(o){let e=new ve(o.secrets);Je(),o.subscriptions.push({dispose:Be}),ft(o,e),o.subscriptions.push(D.commands.registerCommand("shipshape.openSettings",async()=>{let r=await o.secrets.get("shipshape.buildApiKey"),a=await D.window.showInputBox({prompt:"Enter your Locus Build API key",password:!0,placeHolder:"claw_...",value:r?"(already set \u2014 enter new key to replace)":"",validateInput:d=>!d||d.startsWith("(already")||d.startsWith("claw_")?null:"Key must start with claw_"});!a||a.startsWith("(already")||(await o.secrets.store("shipshape.buildApiKey",a),e.clearTokenCache(),D.window.showInformationMessage("Locus API key saved."))})),yt(o,e),bt(o,e),kt(o,e),Pt(o,e);let t=new Re(e,o.extensionUri);o.subscriptions.push(D.commands.registerCommand("shipshape.manageEnvVars",async r=>{if(r instanceof C){t.show(r.service.id,r.service.name);return}D.window.showInformationMessage('Right-click a service in the Services sidebar and choose "Manage Env Vars".')}));let n=new Ie(e,o.extensionUri,o.globalState);o.subscriptions.push(D.commands.registerCommand("shipshape.addDomain",async r=>{await Mt(o,e,n,r)}),D.commands.registerCommand("shipshape.manageDomains",async()=>{await jt(e)})),o.subscriptions.push(D.commands.registerCommand("shipshape.configureAiApiKey",async()=>{if(await Z(o.secrets)){let d=await D.window.showInformationMessage("A Gemini API key is already saved. Replace it?","Replace","Clear","Cancel");if(d==="Clear"){await ze(o.secrets),D.window.showInformationMessage("Gemini API key cleared.");return}if(d!=="Replace")return}await fe(o.secrets)&&D.window.showInformationMessage("Gemini API key saved.")}));let s=new ne(e);o.subscriptions.push({dispose:()=>s.disposeAll()}),Et(o,e,s),It(o,e),o.subscriptions.push(D.commands.registerCommand("shipshape.provisionTenant",()=>{D.window.showInformationMessage("Multi-tenant provisioner \u2014 coming in Phase 6 (Tier 3 stretch).")}));let i=new Ee(e);o.subscriptions.push(D.window.registerTreeDataProvider("shipshape.serviceExplorer",i),D.window.registerTreeDataProvider("shipshape.deploymentHistory",i),D.commands.registerCommand("shipshape.refreshServices",()=>i.refresh()))}function Jo(){Be()}0&&(module.exports={activate,deactivate});
