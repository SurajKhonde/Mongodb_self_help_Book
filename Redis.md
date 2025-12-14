# Redis

## Redis Pub/Sub

## Understanding Pub/Sub
Think of Pub/Sub like a school announcement system.
Publishers are students/teachers who write an announcement.
There’s a notice board room (the broker / Pub/Sub service) that collects announcements.
Subscribers are classes who signed up to receive certain announcements.
The broker makes sure everyone who subscribed gets a copy, even though the publisher doesn’t know who they are.
That’s the big win: publisher and subscriber don’t talk directly. They only agree on a topic name.

### Diagram (who handles messages + how requests/queues are managed)

#### 1) High-level view

``` text

   Publisher (Service A)
          |
          |  publish(message)
          v
+---------------------------+
|   Pub/Sub Broker/Service  |   (handles routing, buffering, retries)
|        (TOPIC)            |
+---------------------------+
      |            |
      | fan-out    | fan-out  (copies message for each subscription)
      v            v
 Subscriber 1   Subscriber 2
 (Service B)    (Service C)

```

#### 2) Inside view (queues, workers, ack, retries)

```text
                       (TOPIC)
Publisher --->  +-------------------+
 publish(msg)   |  Broker / PubSub  |
                | - stores message  |
                | - routes copies   |
                +-------------------+
                      | creates a copy per subscription
          +-----------+--------------------+
          |                                |
          v                                v
  +------------------+              +------------------+
  | Subscription: B  |              | Subscription: C  |
  | (Queue/Backlog)  |              | (Queue/Backlog)  |
  +------------------+              +------------------+
          | pull/push                      | pull/push
          v                                v
   +---------------+                +---------------+
   | Workers (B)   |                | Workers (C)   |
   |  B1  B2  B3   |                |   C1  C2      |
   +---------------+                +---------------+
          | process ok                      | process fails
          |                                 |
          v                                 v
      ACK to broker                    NACK / no-ACK
          |                                 |
          v                                 v
   message removed                   broker retries later
                                      (after delay / deadline)
                                            |
                                            v
                                   Dead-Letter Queue (optional)

```

##### What’s being “managed” inside (important):

- **Topic**: a named channel (like “orders.created”).
- **Subscription**: each subscriber gets its own delivery stream (like its own inbox/queue).
- **Backlog/Queue**: if subscribers are slow, messages wait here (buffering).
- **Workers**: multiple instances can process messages in parallel (scaling).
- **ACK**: subscriber says “done ✅” so broker removes the message from that subscription.
- **Retry**: if no ACK, broker sends again (at-least-once delivery in many systems).
- **Dead-letter**: after too many failures, message goes to a special place for debugging.
  
###### Why it’s called **“asynchronous”**

- Publisher sends message and doesn’t wait for subscribers to finish.
- Publisher stays fast.
- Subscribers can take their time.

###### Real-world example (very relatable)

- “Order placed” in an e-commerce app:
- Publisher: Order Service publishes order.created
**Subscribers:**
- `Email Service`sends confirmation email
- `Inventory Service` reduces stock
- `Analytics Service` records metrics
- `Shipping Service` prepares shipping label
- Publisher does **one publish**, and many services react independently.

###### Two common ways subscribers receive messages

**Pull**: subscriber asks broker “give me next message” (good control).
**Push**: broker pushes to subscriber endpoint (like webhook delivery).

##### Components (kid-simple + real meaning)

1) Publisher

- **Kid version**: The person who writes an announcement.
- **System version**: Any service that sends an event/message (Order service, Payment service, etc.)
- Publisher only knows: **topic name.**

**1) Subscriber**
- **Kid version**: People who signed up to get certain announcements.
- **System version**: Any service that receives messages from a topic via a subscription (Email service, Inventory service…).
- Subscriber decides what it cares about.

**3) Topic**

- **Kid version:** A labeled bucket like “Homework”, “Sports”, “Fees”.
- **System version:** A named channel where publishers post messages. Example: orders.created.
- Topic does **not** mean “one subscriber”. Many subscribers can subscribe.
**4) Message**
- **Kid version:** The actual note/announcement paper.
- **System version:** The data payload (JSON, bytes) + metadata.
   -  Example payload: { orderId: "123", total: 499 }
   -  Metadata: timestamp, id, attributes, etc.

**5) Broker**
- **Kid version:** The school office that receives announcements and sends copies to the right classes.
- **System version:** The Pub/Sub system itself (Kafka / RabbitMQ / Google Pub/Sub / Redis PubSub).

**Responsibilities usually include:**
- Keep topics
- Keep subscriptions
- Store/buffer messages (depending on system)
**Deliver to subscribers**
Track ACK / retries (again depends on system)
**6) Routing**
- Kid version: The office decides which class gets which announcement.
- System version: Broker checks:

Which subscribers are subscribed to this topic?
Any filters? (ex: only country=IN)
Then it delivers message to the correct subscriptions.

```text
        (1) Publisher
             |
             | publish(message) to Topic "T"
             v
      +-------------------+
      |   (5) Broker      |
      |  Topics + Subs    |
      +-------------------+
             |
      (6) routing/fan-out
     /           |          \
    v            v           v
(2) Sub A     (2) Sub B    (2) Sub C

```

