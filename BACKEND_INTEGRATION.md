# Rover Monitor — Contrato de Integração com o Backend

Este documento descreve a arquitetura de comunicação entre a interface web **Rover Monitor** e o backend do sistema de controle do carrinho autônomo. O frontend foi desenvolvido para funcionar tanto com arquivos de log locais e dados demonstrativos quanto conectado a uma API REST real sem necessidade de reescrever as páginas e componentes visuais.

---

## 1. Configuração e Variáveis de Ambiente

As configurações de conexão são controladas por variáveis de ambiente no arquivo `.env` ou `.env.local`:

```env
# URL base do servidor backend REST
VITE_API_URL=http://localhost:3000/api

# Modo de dados da aplicação: 'mock' (demonstração local) ou 'api' (servidor backend)
VITE_DATA_SOURCE=mock
```

- **`VITE_DATA_SOURCE=mock`**: O frontend utiliza o mecanismo de simulação e processamento em memória, permitindo visualização de logs demonstrativos ou importação de arquivos `.json` e `.csv` no navegador.
- **`VITE_DATA_SOURCE=api`**: O frontend faz requisições HTTP reais para o `VITE_API_URL`. Caso o backend esteja inacessível, o sistema exibe mensagens claras com opção para tentar reconectar.

---

## 2. Centralização de Comunicação

Toda a camada de rede é centralizada em:
- `src/services/api.ts`: Cliente HTTP com suporte a timeout (10s), headers padrão (`application/json`) e tratamento de erros padronizado.
- `src/services/missionsService.ts`: Chamadas referentes a missões e percursos.
- `src/services/logsService.ts`: Consulta de logs brutos e upload em lote.
- `src/services/alertsService.ts`: Consulta e reconhecimento de alertas de segurança.
- `src/services/metricsService.ts`: Obtenção de KPIs e estatísticas agregadas.

---

## 3. Endpoints REST Propostos

> **Nota:** Todos os endpoints abaixo são contratos propostos para implementação pela equipe de backend.

### 3.1. Verificação de Saúde (Health Check)
- **Método:** `GET`
- **Endpoint:** `/api/health`
- **Descrição:** Verifica a disponibilidade do serviço backend e a conectividade com o barramento do carrinho.
- **Resposta de Sucesso (`200 OK`):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-10-19T18:00:00.000Z",
  "roverConnected": true
}
```

---

### 3.2. Indicadores do Dashboard (Metrics)
- **Método:** `GET`
- **Endpoint:** `/api/dashboard/metrics`
- **Parâmetros de Consulta (Query Params):**
  - `period`: `24h` | `7d` | `30d` | `all` | `custom`
  - `startDate`: string ISO (opcional quando `period=custom`)
  - `endDate`: string ISO (opcional quando `period=custom`)
- **Resposta de Sucesso (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "totalMissions": 18,
    "completedMissions": 15,
    "inProgressMissions": 1,
    "failedMissions": 1,
    "abortedMissions": 1,
    "indeterminateMissions": 0,
    "avgDurationSeconds": 112,
    "medianDurationSeconds": 110,
    "minDurationSeconds": 85,
    "maxDurationSeconds": 165,
    "totalStops": 12,
    "presenceStops": 8,
    "otherStops": 3,
    "unknownStops": 1,
    "completionRate": 83.3,
    "activeAlertsCount": 2,
    "totalErrors": 2
  }
}
```

---

### 3.3. Listagem de Missões
- **Método:** `GET`
- **Endpoint:** `/api/missions`
- **Parâmetros de Consulta:**
  - `period`: `24h` | `7d` | `30d` | `all`
  - `status`: `all` | `completed` | `in_progress` | `aborted` | `failed`
  - `origin`: string (ex: `Ponto A`)
  - `destination`: string (ex: `Ponto B`)
  - `search`: termo de busca textual
  - `page`: número da página (iniciando em 1)
  - `pageSize`: quantidade de registros (10, 25, 50)
- **Resposta de Sucesso (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "MS-2026-081",
      "origin": "Ponto A",
      "destination": "Ponto B",
      "status": "completed",
      "startedAt": "2026-10-19T08:15:00.000Z",
      "endedAt": "2026-10-19T08:16:48.000Z",
      "durationSeconds": 108,
      "stopCount": 1,
      "presenceStopCount": 1,
      "errorCount": 0,
      "eventCount": 7,
      "stopReasons": [
        { "reason": "Presença detectada", "count": 1 }
      ]
    }
  ],
  "total": 48,
  "page": 1,
  "pageSize": 10
}
```

---

### 3.4. Detalhes de uma Missão Específica
- **Método:** `GET`
- **Endpoint:** `/api/missions/:id`
- **Resposta de Sucesso (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "id": "MS-2026-081",
    "origin": "Ponto A",
    "destination": "Ponto B",
    "status": "completed",
    "startedAt": "2026-10-19T08:15:00.000Z",
    "endedAt": "2026-10-19T08:16:48.000Z",
    "durationSeconds": 108,
    "stopCount": 1,
    "presenceStopCount": 1,
    "errorCount": 0,
    "eventCount": 7,
    "stopReasons": [
      { "reason": "Presença detectada", "count": 1 }
    ],
    "events": [
      {
        "id": "evt-101",
        "missionId": "MS-2026-081",
        "timestamp": "2026-10-19T08:15:00.000Z",
        "eventType": "mission_start",
        "command": "INIT \"Ponto A\"",
        "roverState": "idle",
        "severity": "info",
        "message": "Missão iniciada de Ponto A para Ponto B. Carga acoplada."
      },
      {
        "id": "evt-103",
        "missionId": "MS-2026-081",
        "timestamp": "2026-10-19T08:15:45.000Z",
        "eventType": "presence_detected",
        "roverState": "obstacle_hold",
        "severity": "warning",
        "message": "Presença detectada pelo sensor frontal a 80cm de distância."
      }
    ]
  }
}
```

---

### 3.5. Listagem de Logs e Telemetria
- **Método:** `GET`
- **Endpoint:** `/api/logs`
- **Parâmetros de Consulta:**
  - `missionId`: filtro por missão
  - `eventType`: tipo do evento (`command`, `presence_detected`, etc.)
  - `severity`: `info` | `warning` | `error` | `critical`
  - `search`: busca por texto na mensagem ou comando
  - `page`, `pageSize`
- **Resposta de Sucesso (`200 OK`):**
```json
{
  "success": true,
  "data": [
    {
      "id": "evt-104",
      "missionId": "MS-2026-081",
      "timestamp": "2026-10-19T08:15:46.000Z",
      "eventType": "stop_preventive",
      "command": "STOP",
      "roverState": "stopped",
      "severity": "warning",
      "message": "Parada preventiva realizada com sucesso. Aguardando liberação."
    }
  ]
}
```

---

### 3.6. Envio / Importação de Logs em Lote
- **Método:** `POST`
- **Endpoint:** `/api/logs/import`
- **Corpo da Requisição (JSON Body):**
```json
{
  "events": [
    {
      "id": "evt-901",
      "missionId": "MS-2026-089",
      "timestamp": "2026-10-19T18:30:00.000Z",
      "eventType": "mission_start",
      "command": "INIT \"Ponto A\"",
      "roverState": "idle",
      "severity": "info",
      "message": "Início de percurso Ponto A -> Ponto B"
    }
  ]
}
```
- **Resposta (`201 Created` ou `200 OK`):**
```json
{
  "success": true,
  "data": {
    "importedCount": 1,
    "ignoredCount": 0
  }
}
```

---

### 3.7. Central de Alertas e Reconhecimento
- **Listar Alertas:** `GET /api/alerts?status=unacknowledged`
- **Reconhecer Alerta:** `PATCH /api/alerts/:id/acknowledge`
- **Resposta do Reconhecimento:**
```json
{
  "success": true,
  "data": {
    "id": "alt-1",
    "acknowledged": true,
    "acknowledgedAt": "2026-10-19T18:05:00.000Z"
  }
}
```

---

## 4. Normalização de Esquema e Campos Alternativos

O normalizador do frontend (`src/utils/logParser.ts`) é resiliente e aceita variações comuns de cabeçalhos nos arquivos JSON ou CSV enviados pelo carrinho:

| Campo Canônico | Nomes Alternativos Aceitos no Parser |
| :--- | :--- |
| `timestamp` | `time`, `datetime`, `event_time`, `date`, `data_hora`, `horario`, `ts` |
| `missionId` | `mission_id`, `id_missao`, `missao`, `mission`, `trip_id`, `run_id` |
| `eventType` | `event_type`, `tipo_evento`, `tipo`, `type`, `event`, `action`, `category` |
| `command` | `comando`, `cmd`, `instruction`, `instrucao` |
| `roverState` | `rover_state`, `estado`, `state`, `status_carrinho` |
| `severity` | `severidade`, `level`, `nivel`, `grau`, `log_level` |
| `message` | `mensagem`, `msg`, `description`, `descricao`, `detail` |

---

## 5. Instruções para Executar e Conectar

1. **Instalar dependências:**
   ```bash
   npm install
   ```
2. **Iniciar o frontend em desenvolvimento:**
   ```bash
   npm run dev
   ```
   A aplicação estará disponível em `http://localhost:3000`.
3. **Conectar ao backend real:**
   No arquivo `.env`, altere:
   ```env
   VITE_DATA_SOURCE=api
   VITE_API_URL=http://localhost:8080/api
   ```
   O frontend passará a consumir automaticamente os endpoints definidos neste documento.
