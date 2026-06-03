---
**Frontend README:**
```markdown
# AuditChain — Frontend
Premium dark-theme SPA for AuditChain — an AI-powered smart contract security auditing platform.  
Built with vanilla HTML, CSS, and JavaScript. No framework. No build step.
## Live Site
**https://auditchain-app.netlify.app**
## Pages
| Page | Description |
|------|-------------|
| Home | Hero + problem statement + platform overview + dashboard preview |
| How It Works | 6-step audit pipeline walkthrough |
| Upload | Drag-and-drop `.sol` file upload with skeleton loading screen |
| Fetch Report | Retrieve any audit by transaction hash |
| Verify | Confirm audit authenticity using transaction hash only |
| About | Mission, tech stack, developer profile, roadmap |
## Key Features
- **Skeleton loading screen** during audit pipeline — user stays on upload page until TX confirms
- **Download Suggested Fix** — AI-generated fixed contract available after every audit
- **TX-hash-only verification** — no wallet, no MetaMask, no gas required
- **Real Etherscan + IPFS links** on every audit result
- Apple/Linear-inspired dark design with spring-physics navigation
## Tech Stack
| Layer | Technology |
|-------|-----------|
| Language | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Fonts | Inter + JetBrains Mono (Google Fonts) |
| Deployment | Netlify (CDN, auto-deploy from GitHub) |
| Backend API | https://github.com/aryavchanduka18-web/auditchain-backend |
## Local Setup
```bash
git clone https://github.com/aryavchanduka18-web/auditchain-frontend
cd auditchain-frontend
# Open index.html with VS Code Live Server
# Update API_BASE in index.html to point to your local backend
Design References
Apple — typography, motion, storytelling
Linear — dashboard clarity, card discipline
Stripe — trust, polish, hierarchy
