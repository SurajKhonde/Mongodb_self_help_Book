
# 📌 MongoDB CRUD Cheat Sheet
 #### 🔹 Create
 **Insert one document**
```js
db.collection.insertOne({ name: "Suraj", age: 25 })
```

 **Insert multiple documents**
```js
db.collection.insertMany([{ name: "Raj" }, { name: "Aman" }])
```
#### 🔹 Read
 **Find all documents**
```js
db.collection.find()
```
 **Find one document**
```js
db.collection.findOne({ name: "Suraj" })
```
 **Query with condition**
```js
db.collection.find({ age: { $gt: 20 } })
```

 **Projection (select specific fields)**
```js
db.collection.find({}, { name: 1, age: 1, _id: 0 })
```

 **Sort**
```js
db.collection.find().sort({ age: -1 })  // -1 = desc, 1 = asc

```
**Limit**
```js
db.collection.find().limit(5)

```
#### 🔹 Update
**Update one document**
```js
db.collection.updateOne(
  { name: "Suraj" },
  { $set: { age: 26 } }
)
```
**Update multiple documents**
```js
db.collection.updateMany(
  { country: "India" },
  { $set: { isActive: true } }
)
```

**Increment a field**
```js
db.collection.updateOne(
  { name: "Suraj" },
  { $inc: { loginCount: 1 } }
)
```

**Push into array**
```js
db.collection.updateOne(
  { name: "Suraj" },
  { $push: { hobbies: "Music" } }
)
```
 **Pull from array** 
```js
db.collection.updateOne(
  { name: "Suraj" },
  { $pull: { hobbies: "Music" } }
)
```

#### 🔹 Delete
**Delete one document**
```js
db.collection.deleteOne({ name: "Suraj" })
```

**Delete many documents**
```js
db.collection.deleteMany({ country: "India" });
```
**Drop entire collection**
```js
db.collection.drop()
```
