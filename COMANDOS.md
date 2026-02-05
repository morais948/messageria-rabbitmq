# Scripts úteis para o projeto

## Iniciar infraestrutura
```bash
docker-compose up -d
```

## Verificar status
```bash
docker ps
```

## Acessar RabbitMQ Management
http://localhost:15672
- Usuário: admin
- Senha: admin123

## Instalar dependências de todos os serviços
```bash
cd orders-service && npm install && cd ..
cd payments-service && npm install && cd ..
```

## Executar em modo desenvolvimento

Terminal 1:
```bash
cd orders-service
npm run start:dev
```

Terminal 2:
```bash
cd payments-service
npm run start:dev
```

## Testar criação de pedido
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Maria Santos",
    "product": "Mouse Gamer",
    "amount": 150.00
  }'
```

## Ver pedidos
```bash
curl http://localhost:3000/orders
```

## Ver pagamentos
```bash
curl http://localhost:3001/payments
```

## Parar tudo
```bash
docker-compose down
```

## Limpar tudo (incluindo volumes)
```bash
docker-compose down -v
```
