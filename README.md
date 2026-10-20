Translate natural-language requests into Active Directory runbooks, review the generated YAML, and execute it inside a pre-built Samba lab. Follow the steps below to get the project running from a clean clone.

Sandbox Playbook Cheat Sheet
----------------------------

- **Allowed actions**
  - `create_user`
  - `add_user_to_group`
  - `remove_user_from_group`
  - `create_group`
  - `apply_gpo`
  - `reset_password`
- **Valid groups**
  - Helpdesk
  - Workstations *(treat any “all machines” request as membership in this group)*
  - ITAdmins
  - Any group created earlier in the same plan via `create_group`
- **Machine names**
  - machine01
  - machine02
- **Prompt patterns that produce valid plans**
  - “Create a helpdesk user named Sam Rivers and add to Helpdesk.”
  - “Reset Bob Smith’s password to NewPass!23 and force a change at next logon.”
  - “Add Alice Johnson to the Workstations group.”
  - “Remove Charlie Davis from ITAdmins.”
  - “Create a Support group under the Groups OU and add Maria after creating the group.”
  - “Apply Default Domain Policy to the Workstations OU with enforcement enabled.”

Prerequisites
-------------

Install these tools before you begin:

- **Git** – for cloning the repository.
- **Node.js 18.x** (or newer) and `npm` – https://nodejs.org.
- **Docker Engine + Docker Compose v2** – https://docs.docker.com/engine/install/.
- **cURL or wget** – for downloading the model file.
- *(Optional GPU acceleration)* NVIDIA driver + CUDA runtime. To offload the LLM to GPU you also need `nvidia-container-toolkit` and the CUDA build of `node-llama-cpp`.

Setup Checklist
---------------

1. **Clone the repository**

   ```bash
   git clone https://github.com/<your-account>/ADAutomation.git
   cd ADAutomation
   ```

2. **Download the planner model**

   ```bash
   mkdir -p models
   curl -L -o models/Mistral-7B-Instruct-v0.3.Q4_K_M.gguf \
     https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/mistral-7b-instruct-v0.3.Q4_K_M.gguf
   ```

   > You can choose a different `.gguf` file if you prefer another quantisation. Update `PLANNER_MODEL_FILE` in `backend/.env` if you rename the model.

3. **Install workspace dependencies**

   ```bash
   npm install
   npm --prefix backend install
   npm --prefix client install
   ```

4. **Create environment files**

   ```bash
   cp backend/.env.example backend/.env
   cp client/.env.example client/.env
   ```

   Adjust the PIN or API base URL if needed. To enable GPU acceleration set `PLANNER_GPU_LAYERS` (for example `32`) and install the CUDA binding:

   ```bash
   npm --prefix backend install @node-llama-cpp/linux-x64-cuda
   export PLANNER_GPU_LAYERS=32
   ```

5. **Start the Active Directory lab**

   ```bash
   cd infrastructure/ad-lab
   docker compose up -d
   docker compose logs -f domain-controller
   ```

   Wait until you see Samba report that provisioning and seeding are complete. The two lab hosts (`machine01`, `machine02`) will automatically join the domain.

6. **Start the backend and frontend**

   From the project root (`~/ADAutomation`):

   ```bash
   npm run dev
   ```

   - Backend API: http://127.0.0.1:4000
   - Frontend UI: http://localhost:5173 (default PIN 227470)

   > If you see `EADDRINUSE` on port 4000, terminate any previous backend (`pkill -f "node src/server.js"`) or set `PORT` in `backend/.env` to a free port.

Verify Everything Works
-----------------------

1. Visit the UI at http://localhost:5173 and enter the PIN.
2. Submit a prompt (e.g. “Create a helpdesk user named Sam Rivers and add to Helpdesk”).
3. Review the YAML plan, approve it, and watch execution logs stream from the Docker lab.
4. Confirm user/group changes in the lab (optional):

   ```bash
   docker compose exec -f infrastructure/ad-lab/docker-compose.yml --project-name ad-lab domain-controller samba-tool user show sam_rivers
   ```

Troubleshooting
---------------

- **Backend port already used** – stop any existing service on `127.0.0.1:4000` (e.g. `lsof -i :4000; kill <pid>`) or change `PORT` in `backend/.env`.
- **Planner fails to load on GPU** – ensure CUDA drivers are installed, or fall back to CPU by unsetting `PLANNER_GPU_LAYERS`.
- **Lab provisioning errors** – check logs with `docker compose logs -f domain-controller`. Breathing on/off usually fixes a partial provision: `docker compose down -v && docker compose up -d`.

Useful Commands
---------------

```bash
# Run backend tests
npm --prefix backend test

# Stop the lab
cd infrastructure/ad-lab
docker compose down -v

# Restart backend/frontend after code changes
npm run dev
```
