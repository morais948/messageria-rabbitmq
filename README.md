# 🚀 Projeto de Microserviços com NestJS e RabbitMQ

Este projeto demonstra de forma **prática e didática** como funciona a comunicação entre microserviços usando **RabbitMQ** como broker de mensageria, com **NestJS** como framework e **MySQL** como banco de dados.

## 📋 Arquitetura do Projeto

```
┌─────────────────────┐         ┌──────────────┐         ┌─────────────────────┐
│  Orders Service     │         │  RabbitMQ    │         │  Payments Service   │
│  (Porta 3000)       │────────▶│  (Broker)    │────────▶│  (Porta 3001)       │
│                     │         │              │         │                     │
│  MySQL (3306)       │         │  Exchange    │         │  MySQL (3307)       │
│  orders_db          │         │  + Filas     │         │  payments_db        │
└─────────────────────┘         └──────────────┘         └─────────────────────┘
```

### Fluxo de Comunicação:

1. **Cliente cria um pedido** → POST para Orders Service
2. **Orders Service** salva o pedido no banco e **publica mensagem** no RabbitMQ
3. **RabbitMQ** roteia a mensagem para a fila correta
4. **Payments Service** consome a mensagem e processa o pagamento
5. **Payments Service** publica resultado do pagamento
6. **Orders Service** consome o resultado e atualiza o status do pedido

---

## 🎯 Conceitos de Messageria Explicados

### O que é RabbitMQ?

RabbitMQ é um **message broker** (intermediário de mensagens) que permite que aplicações se comuniquem de forma **assíncrona** e **desacoplada**. Ao invés de chamar diretamente outro serviço, você envia uma mensagem para o RabbitMQ, que entrega para quem está interessado.

### Componentes Principais:

#### 1. **Exchange** (Trocador)
- É o "porteiro" do RabbitMQ
- Recebe mensagens dos produtores e decide para qual fila enviar
- **Tipos**:
  - `direct`: Roteamento exato por routing key
  - `topic`: Roteamento por padrões (usamos este!)
  - `fanout`: Envia para todas as filas
  - `headers`: Roteamento por headers

**Por que usamos `topic`?**

O tipo `topic` é mais **flexível** e **escalável** para arquiteturas de microserviços:

```typescript
// Com TOPIC, podemos usar padrões:
order.created      // específico
order.*            // todos eventos de order
payment.*          // todos eventos de payment
*.processed        // todos eventos processados
#                  // tudo (como fanout)
```

**Comparação:**

| Tipo | Uso | Exemplo no Projeto |
|------|-----|-------------------|
| **direct** | Roteamento exato - precisa match perfeito | Se usássemos, precisaríamos routing key exata. Menos flexível para evoluir |
| **topic** ✅ | Roteamento por padrões - permite wildcards (`*` e `#`) | `order.created`, `order.updated`, `order.*` - podemos adicionar novos eventos facilmente |
| **fanout** | Broadcast - envia para TODAS as filas | Se usássemos, TODAS as filas receberiam TODAS as mensagens (não queremos isso) |
| **headers** | Roteamento por headers HTTP-like | Mais complexo, desnecessário para nosso caso |

**Vantagem no nosso projeto:**

```typescript
// Hoje temos:
order.created → vai para fila order.created
payment.processed → vai para fila payment.processed

// Amanhã podemos adicionar facilmente:
order.updated → nova fila
order.cancelled → nova fila

// E criar consumidores que escutam padrões:
order.*  → escuta TODOS eventos de pedidos
*.failed → escuta TODAS falhas do sistema
```

**Resumindo:** `topic` é o mais usado em microserviços porque permite organização hierárquica das mensagens e facilita a evolução do sistema sem quebrar código existente! 🎯

#### 2. **Queue** (Fila)
- Armazena as mensagens até serem consumidas
- Mensagens ficam em ordem (FIFO - First In, First Out)
- Podem ser duráveis (persistem após restart do RabbitMQ)

#### 3. **Routing Key**
- É a "etiqueta" da mensagem
- O Exchange usa para decidir para qual fila enviar
- Exemplo: `order.created`, `payment.processed`

#### 4. **Binding**
- Conecta um Exchange a uma Queue
- Define qual routing key vai para qual fila

#### 5. **Producer** (Produtor)
- Quem envia mensagens
- No nosso caso: Orders Service (cria pedido) e Payments Service (envia resultado)

#### 6. **Consumer** (Consumidor)
- Quem recebe e processa mensagens
- No nosso caso: Payments Service (recebe pedido) e Orders Service (recebe resultado)

---

## 🔍 Como Funciona no Nosso Projeto

### Estrutura do RabbitMQ

```typescript
Exchange: "orders_exchange" (tipo: topic)
│
├── Binding: "order.created" ──▶ Queue: "order.created"
│                                  └─ Consumida por: Payments Service
│
└── Binding: "payment.processed" ──▶ Queue: "payment.processed"
                                     └─ Consumida por: Orders Service
```

### Configuração do RabbitMQ (rabbitmq.service.ts)

```typescript
// 1. CONEXÃO
this.connection = amqp.connect(['amqp://admin:admin123@localhost:5672']);

// 2. CRIAÇÃO DO CHANNEL
this.channelWrapper = this.connection.createChannel({
  json: true, // Serializa/deserializa JSON automaticamente
  setup: async (channel: Channel) => {
    
    // 3. CRIAR EXCHANGE
    await channel.assertExchange('orders_exchange', 'topic', { durable: true });
    
    // 4. CRIAR FILAS
    await channel.assertQueue('order.created', { durable: true });
    await channel.assertQueue('payment.processed', { durable: true });
    
    // 5. CRIAR BINDINGS (vincular fila ao exchange)
    await channel.bindQueue('order.created', 'orders_exchange', 'order.created');
    await channel.bindQueue('payment.processed', 'orders_exchange', 'payment.processed');
  },
});
```

**Explicação**:
- `durable: true` → Se o RabbitMQ reiniciar, filas e exchanges não são perdidos
- `json: true` → Converte objetos JS para JSON automaticamente
- `bindQueue` → Liga a fila ao exchange através da routing key

---

### Publicando Mensagens (Producer)

```typescript
async publish(routingKey: string, message: any) {
  await this.channelWrapper.publish(
    'orders_exchange',  // Exchange
    routingKey,         // Routing Key (ex: 'order.created')
    message,            // Dados da mensagem
    { persistent: true } // Mensagem persiste em disco
  );
}
```

**Como usar**:
```typescript
// No Orders Service - quando cria um pedido
const event = {
  orderId: 123,
  customerName: 'João',
  amount: 99.90
};

await rabbitMQService.publish('order.created', event);
```

---

### Consumindo Mensagens (Consumer)

```typescript
async consume(queue: string, callback: (message: any) => Promise<void>) {
  await channel.consume(
    queue,
    async (msg) => {
      if (msg) {
        const content = JSON.parse(msg.content.toString());
        
        try {
          await callback(content); // Processa a mensagem
          channel.ack(msg);        // ACK: "recebi e processei!"
        } catch (error) {
          channel.nack(msg);       // NACK: "não consegui processar"
        }
      }
    },
    { noAck: false } // Requer confirmação manual
  );
}
```

**Explicação**:
- `ack(msg)` → Confirma que processou com sucesso (remove da fila)
- `nack(msg)` → Rejeita a mensagem (pode voltar para a fila)
- `noAck: false` → Confirmação manual (mais seguro)

**Como usar**:
```typescript
// No Payments Service - escuta novos pedidos
await rabbitMQService.consume('order.created', async (message) => {
  console.log('Pedido recebido:', message);
  await processPayment(message.orderId, message.amount);
});
```

---

## 📂 Estrutura dos Microserviços

### Orders Service (Serviço de Pedidos)

**Responsabilidades**:
- ✅ Criar pedidos
- ✅ Salvar no banco `orders_db`
- ✅ **Publicar** evento `order.created`
- ✅ **Consumir** evento `payment.processed`
- ✅ Atualizar status do pedido

**Arquivo Principal**: `orders.service.ts`

```typescript
async createOrder(customerName: string, product: string, amount: number) {
  // 1. Salva no banco
  const order = await this.ordersRepository.save({
    customerName,
    product,
    amount,
    status: 'PENDING'
  });

  // 2. Publica evento no RabbitMQ
  await this.rabbitMQService.publish('order.created', {
    orderId: order.id,
    customerName: order.customerName,
    amount: order.amount,
    timestamp: new Date()
  });

  return order;
}

// 3. Escuta resposta do pagamento
async listenToPaymentProcessed() {
  await this.rabbitMQService.consume('payment.processed', async (message) => {
    const order = await this.ordersRepository.findOne({ 
      where: { id: message.orderId } 
    });
    
    order.status = message.status; // 'PAID' ou 'FAILED'
    await this.ordersRepository.save(order);
  });
}
```

---

### Payments Service (Serviço de Pagamentos)

**Responsabilidades**:
- ✅ **Consumir** evento `order.created`
- ✅ Processar pagamento (simula com 70% de sucesso)
- ✅ Salvar no banco `payments_db`
- ✅ **Publicar** evento `payment.processed`

**Arquivo Principal**: `payments.service.ts`

```typescript
async listenToOrderCreated() {
  await this.rabbitMQService.consume('order.created', async (message) => {
    console.log('Novo pedido recebido:', message.orderId);

    // 1. Processa o pagamento
    const payment = await this.processPayment(message.orderId, message.amount);

    // 2. Publica resultado
    await this.rabbitMQService.publish('payment.processed', {
      orderId: message.orderId,
      status: payment.status, // 'PAID' ou 'FAILED'
      message: payment.message,
      timestamp: new Date()
    });
  });
}

async processPayment(orderId: number, amount: number) {
  // Simula processamento (70% de sucesso)
  const isSuccess = Math.random() > 0.3;
  
  return this.paymentsRepository.save({
    orderId,
    amount,
    status: isSuccess ? 'PAID' : 'FAILED',
    transactionId: isSuccess ? `TXN-${Date.now()}` : null,
    message: isSuccess ? 'Sucesso' : 'Falha no pagamento'
  });
}
```

---

## 🛠️ Como Executar o Projeto

### 1️⃣ Subir a Infraestrutura (Docker)

```bash
# Na raiz do projeto
docker-compose up -d
```

Isso sobe:
- RabbitMQ (porta 5672 + interface web 15672)
- MySQL Orders (porta 3306)
- MySQL Payments (porta 3307)

### 2️⃣ Instalar Dependências

```bash
# Orders Service
cd orders-service
npm install

# Payments Service
cd ../payments-service
npm install
```

### 3️⃣ Executar os Microserviços

**Terminal 1 - Orders Service:**
```bash
cd orders-service
npm run start:dev
```

**Terminal 2 - Payments Service:**
```bash
cd payments-service
npm run start:dev
```

---

## 🧪 Testando o Sistema

### 1. Criar um Pedido

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "João Silva",
    "product": "Notebook",
    "amount": 2999.90
  }'
```

### 2. Acompanhar os Logs

**Orders Service (Terminal 1):**
```
💾 Pedido salvo no banco: { id: 1, status: 'PENDING', ... }
📤 Mensagem publicada [order.created]: { orderId: 1, ... }
```

**Payments Service (Terminal 2):**
```
📥 Mensagem recebida de [order.created]: { orderId: 1, ... }
🔔 Novo pedido recebido! ID: 1
💳 Processando pagamento do pedido #1...
💾 Pagamento salvo no banco: { status: 'PAID', ... }
📤 Mensagem publicada [payment.processed]: { orderId: 1, status: 'PAID', ... }
```

**Orders Service (Terminal 1) - Novamente:**
```
📥 Mensagem recebida de [payment.processed]: { orderId: 1, status: 'PAID', ... }
✅ Pedido #1 atualizado para PAID
```

### 3. Consultar Pedidos

```bash
# Ver todos os pedidos
curl http://localhost:3000/orders

# Ver pedido específico
curl http://localhost:3000/orders/1
```

### 4. Consultar Pagamentos

```bash
# Ver todos os pagamentos
curl http://localhost:3001/payments

# Ver pagamento de um pedido específico
curl http://localhost:3001/payments/order/1
```

### 5. Interface Web do RabbitMQ

Acesse: http://localhost:15672
- **Usuário**: admin
- **Senha**: admin123

Aqui você pode:
- Ver filas e quantidade de mensagens
- Ver exchanges e bindings
- Monitorar taxa de mensagens
- Visualizar mensagens nas filas

---

## 🎓 Conceitos Avançados Aplicados

### 1. **Desacoplamento**
- Orders Service não conhece Payments Service
- Se Payments cair, Orders continua funcionando
- Mensagens ficam na fila até serem processadas

### 2. **Assincronismo**
- Orders não espera resposta imediata
- Pagamento é processado em background
- Melhor experiência para o usuário

### 3. **Escalabilidade**
- Posso ter múltiplas instâncias de Payments Service
- RabbitMQ distribui mensagens entre elas (load balancing)
- Processamento paralelo

### 4. **Confiabilidade**
- `persistent: true` → mensagens sobrevivem a crashes
- `durable: true` → filas sobrevivem a restarts
- `ack/nack` → garante processamento

### 5. **Bancos Independentes**
- Cada serviço tem seu próprio banco
- Isolamento de dados
- Escalabilidade independente

---

## 📊 Vantagens da Messageria

| ✅ Vantagem | ❌ Sem Messageria (HTTP direto) |
|-------------|----------------------------------|
| Serviços desacoplados | Serviços acoplados |
| Processamento assíncrono | Processamento bloqueante |
| Resiliência a falhas | Se serviço cair, perde requisição |
| Escalabilidade fácil | Difícil escalar |
| Fila de processamento | Precisa criar fila manualmente |

---

## 🔧 Configurações Importantes

### RabbitMQ Connection

```typescript
// Retry automático se conexão cair
this.connection = amqp.connect(['amqp://admin:admin123@localhost:5672']);

// Eventos de conexão
this.connection.on('connect', () => console.log('Conectado!'));
this.connection.on('disconnect', () => console.log('Desconectado!'));
```

### Persistência

```typescript
// Exchange durável
await channel.assertExchange('orders_exchange', 'topic', { durable: true });

// Fila durável
await channel.assertQueue('order.created', { durable: true });

// Mensagem persistente
await channel.publish(exchange, routingKey, message, { persistent: true });
```

### Confirmação Manual

```typescript
{ noAck: false } // Requer ack/nack manual

// Sucesso
channel.ack(msg);

// Falha - requeue = true (volta para a fila)
channel.nack(msg, false, true);

// Falha - requeue = false (vai para dead letter queue se configurada)
channel.nack(msg, false, false);
```

---

## 🎯 Próximos Passos

Para aprofundar seus conhecimentos:

1. **Dead Letter Queues**: Mensagens que falharam várias vezes
2. **Retry Policy**: Tentar processar novamente antes de descartar
3. **Message TTL**: Tempo de vida das mensagens
4. **Priority Queues**: Mensagens com prioridade
5. **Saga Pattern**: Transações distribuídas
6. **CQRS**: Separação de comandos e queries

---

## 📚 Comandos Úteis

```bash
# Verificar containers
docker ps

# Logs do RabbitMQ
docker logs rabbitmq

# Parar tudo
docker-compose down

# Parar e remover volumes (limpa bancos)
docker-compose down -v

# Reiniciar apenas RabbitMQ
docker-compose restart rabbitmq
```

---

## 🐛 Troubleshooting

**Erro de conexão com RabbitMQ:**
```
Aguarde 10 segundos para o healthcheck passar
docker ps para verificar se está healthy
```

**Erro de conexão com MySQL:**
```
Verifique se as portas 3306 e 3307 estão livres
lsof -i :3306
```

**Mensagens não chegam:**
```
Verifique os bindings no RabbitMQ Management (localhost:15672)
Confira se as routing keys estão corretas
```

---

## 📝 Resumo Final

Este projeto demonstra:

1. ✅ Como configurar RabbitMQ com Docker
2. ✅ Como criar produtores de mensagens (publish)
3. ✅ Como criar consumidores de mensagens (consume)
4. ✅ Comunicação assíncrona entre microserviços
5. ✅ ACK/NACK para garantir processamento
6. ✅ Exchanges, Queues, Bindings e Routing Keys
7. ✅ Bancos de dados independentes por serviço
8. ✅ Padrão de eventos (Event-Driven Architecture)

**Lembre-se**: A messageria é fundamental para construir sistemas distribuídos resilientes e escaláveis! 🚀
