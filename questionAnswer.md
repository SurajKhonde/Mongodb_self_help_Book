# MongoDb most useful queries 

### here is mongodb most asked Question are followings 

We’ll stick to your schema:
``` shell
Users: { firstName, lastName, dob, mobile, email, country, favoriteSongs: [ObjectId], favoriteSinger: ObjectId }
Songs: { title, duration, genre }

Singers: { name, country }
```
🚀 MongoDB 100+ Questions (CRUD → Aggregation → Advanced)

### 1️⃣ CRUD Basics
 - **Insert one user document.**
```js
db.users.insertOne({
  firstName: "Rajesh",
  lastName: "Khanna",
  dob: new Date("1996-01-14"),
  mobile: "9731488596",
  email: "surajrkhonde@gmail.com",
  country: "India",
  favoriteSongs: [
    ObjectId("68b146584c17629b8d763f3a"),
    ObjectId("68b146584c17629b8d763f3b")
  ],
  favoriteSinger: ObjectId("68b1436c1ee2c43c26f7c0a5")
});
```
- **Insert many songs in one query.**
    - **insertMany**expects an arrays of object 
```js
  db.songs.insertMany([
  {
    title: 'Hum aap ke he kon',
    duration: 300,
    genre: 'romance',
  },
  {
    title: 'koi mil gaya',
    duration: 350,
    genre: 'sad',
  }
]);
```
- **Insert multiple singers at once.**
```js
  db.singers.insertMany([
    {
name:'Arjith Singh'
country :'India'
birthDate:new Date("1996-01-14")
genre :"depressed"}, 
{
name:'Sonu Nigham'
country :'India'
birthDate:new Date("1996-01-24")
genre :"energetic"},
  ]);
```
- **Find one user by email.**
```js
db.users.findOne({
    email:'surajrkhonde@gmail.com'
})
```
- **Find all users from India.**
   - 👉 Use `find()` when you just want to filter documents directly.
   -   Use `aggregate()` only when you need data **processing / transformations** like `$group`, `$lookup`, `$project`, `$sort`, etc.

```js
db.users.find({ country: "india" })
// not use aggregate
db.users.aggregate([
  { $match: { country: "india" } }
])
```
- **Find all songs where duration > 200**.
    - **Don't forgot to put operator like gt in curly bracket**
```js
    db.songs.find({duration :{$gt:200}});
``` 

 - 👉 Explanation:
{ duration: { $gt: 200 } } → means “duration greater than 200”.


 - **Update a user’s mobile number.**
```js
  db.users.updateOne( { _id: ObjectId("68b14774ce366d87de12ad19") }
  ,{$set:{mobile :'7348887775'}
  });
```
- **Update all songs of genre Rock to Classic Rock.**
```js
 db.songs.updateMany(
    { genre: "Rock" },  // filter condition     
  { $set: { genre: "Classic Rock" } }
 )
```
- **Delete one user by _id.**
```js
db.users.deleteOne({_id:ObjectId("68b14774ce366d87de12ad19")})
```
- **Delete all singers from a particular country.**
```js
db.singers.deleteMany({
   country:'India'
})
```

### 2️⃣ Array Operations

- **Add a song to a user’s favoriteSongs.**
```js
db.users.updateOne({_id:ObjectId("68b14774ce366d87de12ad19")},
  { $push: {favoriteSongs:ObjectId("68b14774ce366d87de12ad19") } }
)
```
**Remove a song from favoriteSongs.**
```js
db.users.updateOne(
  { _id: ObjectId("68b14774ce366d87de12ad19") },
  { $pull: { favoriteSongs: ObjectId("68b14774ce366d87de12ad19") } }
);
```
- **Find users who have at least 1 favorite song.**
   - **👉 We use $exists and $not with $size: 0 or just check array non-empty:**
```js
db.users.find({favoriteSongs:{$exist:true,$ne:[]}})
```
 - **Find users with exactly 3 favorite songs.**
```js
db.users.find({favoriteSongs:{
    $size:3
}})
```
- **Find users where favoriteSongs contains a specific ObjectId.** 
  - 👉 No need for $eq, just pass the ObjectId.
```js
db.users.find({
favoriteSongs:ObjectId("68b14774ce366d87de12ad19")}
)
```
- **Add multiple songs at once to favorites.**
  - Use $push with $each:
```js
db.users.updateOne(
  { _id: ObjectId("68b14774ce366d87de12ad19") },
  { $push: { favoriteSongs: { $each: [
      ObjectId("68b14774ce366d87de12ad19"),
      ObjectId("68b14774ce366d87de12ad19"),
      ObjectId("68b14774ce366d87de12ad19")
  ] } } }
)
```

- **Ensure favoriteSongs doesn’t contain duplicates ($addToSet).**
```js
db.users.updateOne(
  { _id: ObjectId("68b14774ce366d87de12ad19") },
  { $addToSet: { favoriteSongs: ObjectId("68b14774ce366d87de12ad19") } }
)
```
- **If you want to add multiple unique songs**
```js
db.users.updateOne(
  { _id: ObjectId("68b14774ce366d87de12ad19") },
  { $addToSet: { favoriteSongs: { $each: [
      ObjectId("68b14774ce366d87de12ad19"),
      ObjectId("68b14774ce366d87de12ad19")
  ] } } }
)
```
- **Remove the first song from favoriteSongs.**
```js
 db.users.updateOne({ _id: ObjectId("68b14774ce366d87de12ad19") },{
    $pop:{favoriteSongs:-1}
 })
```

- **Remove the last song from favoriteSongs.**
```js
db.users.updateOne({
    _id:ObjectId("68b14774ce366d87de12ad19")
},{
    $pop:{favoriteSongs:1}
})
```
- **Count how many songs each user has in favoriteSongs.**
```js
db.users.aggregate([
   {$project:{
   username:1,numberofSongs:{$size:"$favoriteSongs"} 
   }} 
])
```
- **For users who have exactly 3 songs:**
```js
db.users.aggregate([
  { $project: { username: 1, numberOfSongs: { $size: "$favoriteSongs" } } },
  { $match: { numberOfSongs: 3 } }
])

```

### 3️⃣ Aggregation Basics

- **Count total users in the database**
  - Count total users (simple way)
```js
db.users.countDocuments()
```
- **Using aggregation**
```js
db.users.aggregate([
  {
    $group: {
      _id: null,
      countOfUsers: { $sum: 1 }
    }
  }
])

```
- **Count total songs.**
```js
db.songs.aggregate([
   {
    $group:{
        _id:null,
        countofSong:{$sum:1}
    }
   } 
])
```
- **Count total singers.**
```js
db.songs.aggregate([
   {
    $group:{
        _id:null,
        countofSinger:{$sum:1}
    }
   } 
])
```
- **Find the oldest user ($sort + $limit).**
```js
db.users.find().sort({ _id: 1 }).limit(1)
```
- If you have a createdAt field 
```js
db.users.find().sort({ createdAt: 1 }).limit(1)
```
- Aggregation way
```js
db.users.aggregate([
  { $sort: { _id: 1 } },
  { $limit: 1 }
])
```
- **Find youngest user.**
 - Oldest user (earliest dob → smallest date)
```js
db.users.find().sort({ dob: 1 }).limit(1)
```

- Youngest user (latest dob → biggest date)
```js
db.users.find().sort({ dob: -1 }).limit(1)
```

- Aggregation style (works the same):

Oldest:
```js
db.users.aggregate([
  { $sort: { dob: 1 } },
  { $limit: 1 }
])

```
Youngest:
```js
db.users.aggregate([
  { $sort: { dob: -1 } },
  { $limit: 1 }
])
```
- **Find average song duration.**
```js
db.songs.aggregate([
  {
    $group: {
      _id: null,
      averageDuration: { $avg: "$duration" }
    }
  }
])
```
- **Find longest song.**
```js
db.songs.aggregate([
  {
    $group: {
      _id: null,
      averageDuration: { $max: "$duration" }
    }
  }
])
```
- **Find Avg,shortest song.**
```js
db.songs.aggregate([
  {
    $group: {
      _id: null,
      averageDuration: { $avg: "$duration" },
      minDuration: { $min: "$duration" },
      maxDuration: { $max: "$duration" }
    }
  }
])
```
- **Group users by country and count them.**
```js
db.users.aggregate([
    {
        $group:{
            _id:'$country',
            countUser:{$sum:1}

        }
    }
])
```
- **Find all distinct countries of users.**
```js
db.users.distinct("country")

```
- **count of users per country sorted by highest?**
```js
db.users.aggregate([
  {
    $group: {
      _id: "$country",
      countUser: { $sum: 1 }
    }
  },
  {
    $sort: { countUser: -1 }
  }
])
```

4️⃣ Aggregation on Arrays

- **Unwind favorite Songs to list one song per row.**
```js
db.users.aggregate([
    {$unwind:'$favoriteSongs'}
])
```
- **Count how many times each song is favorited.**
- just `$unwind` the favoriteSongs array from users and then $group by song id to count how many times each song is favorited.

```js
db.users.aggregate([
  { $unwind: "$favoriteSongs" },
  {
    $group: {
      _id: "$favoriteSongs",  
      timesFavorited: { $sum: 1 }
    }
  }
])

```
- If you also want song details (like title, artist) instead of just _id, you can extend it with a $lookup into the songs collection:
```js
db.users.aggregate([
  { $unwind: "$favoriteSongs" },
  {
    $group: {
      _id: "$favoriteSongs",
      timesFavorited: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "songs",
      localField: "_id",
      foreignField: "_id",
      as: "songDetails"
    }
  },
  { $unwind: "$songDetails" }
])
```
- **Find the top 3 most popular songs.**
   - $sort needs an object
```js
db.users.aggregate([
  { $unwind: "$favoriteSongs" },
  {
    $group: {
      _id: "$favoriteSongs",
      timesFavorited: { $sum: 1 }
    }
  },
  { $sort: { timesFavorited: -1 } }, 
  { $limit: 3 },                      
  {
    $lookup: {
      from: "songs",
      localField: "_id",
      foreignField: "_id",
      as: "songDetails"
    }
  },
  { $unwind: "$songDetails" }       
])
```
- **Find which has the most popular songs.**
```js
db.users.aggregate([
    {$unwind:"$favoriteSongs"},
    {$group:{
        _id:"$favoriteSongs",
        timesFavorited: { $sum: 1 }
    }
    },
    {$sort:{timesFavorited:-1}},
    {$lookup:{
        from:"songs",
         localField: "_id",
      foreignField: "_id",
      as: "songDetails"
    }},
    {$project:{
title:1
    }}
])
```
- **user with the most favorite songs**
```js
db.users.aggregate([
  {
    $project: {
      username: 1,
      favoritesCount: { $size: "$favoriteSongs" }
    }
  },
  { $sort: { favoritesCount: -1 } },
  { $limit: 1 }
])
```
- **Find users who have no favorite songs.**
```js
db.users.find({ favoriteSongs: { $size: 0 } })
```
   - Handle both null/missing and empty
```js
db.users.find({
  $or: [
    { favoriteSongs: { $exists: false } },
    { favoriteSongs: { $size: 0 } }
  ]
})
```


- **Find which country has the most favorite songs overall.**
```js
db.users.aggregate([
  // Break the favoriteSongs array into individual docs
  { $unwind: "$favoriteSongs" },
  {
    $group: {
      _id: "$country",
      totalFavorites: { $sum: 1 }
    }
  },

  // Sort by highest
  { $sort: { totalFavorites: -1 } }
])
```

Find average number of favorite songs per user.

Count how many users like more than 5 songs.

Find the distribution of favoriteSongs array length.

5️⃣ $lookup (Joins / Populate)

Lookup favoriteSongs → get song details for each user.

Lookup favoriteSinger → get singer details for each user.

Find users with singer info embedded via $lookup.

Find all users who like songs of genre Hip Hop.

Find all users whose favoriteSinger is from USA.

Find which singer is most liked by users.

Find which singer’s fans listen to the longest songs.

List all singers along with how many users like them.

Find users who like both singer "A" and song "B".

Find all singers and their fans (users).

6️⃣ Intermediate Aggregations

Find top 3 most common genres among favorite songs.

Group users by favoriteSinger and list their names.

Find which country’s users like the most songs.

Find which song is liked by users across the most countries.

Average age of users who like Rock songs.

Find the most popular singer by number of fans.

Find users who like songs longer than 300 sec.

Find users who like songs of more than 1 genre.

Find which genre has the highest average duration.

Find songs liked by more than 5 users.

7️⃣ Nested + Complex Lookups

Populate favoriteSongs with details, then lookup their singer (multi-join).

Find all singers with list of their songs and fans.

Find which singer’s songs appear most in favoriteSongs.

Find all users and include both favoriteSongs + favoriteSinger details.

Find which song is liked by fans of a particular singer.

Find which singers share fans (users who like more than 1 singer).

Find all users who like songs by their favoriteSinger.

Find overlap: users who like the same 2 songs.

Find users who like songs by singers of their own country.

Find users who like songs only from one genre.

8️⃣ Advanced Filters

Find all users born before 1990.

Find all users with Gmail emails.

Find all users whose mobile starts with “987”.

Find all singers whose name starts with “A”.

Find all songs whose title contains “love”.

Find all users who like no singer.

Find all users who like both Rock and Jazz songs.

Find users who like >2 singers (if schema extended).

Find users who share at least 2 songs in common.

Find users who like the same singer and same song.

9️⃣ Performance + Indexes

Create index on email field.

Create compound index on { country, favoriteSinger }.

Create index on songs.genre.

Use .explain("executionStats") to analyze query speed.

Find slow queries without index.

Add index on users.favoriteSongs.

Query with regex + index.

Partial index on country = India.

Unique index on mobile.

TTL index for temporary data (e.g. sessions).

🔟 Advanced Aggregation / Analytics

Calculate user age at runtime.

Bucket users into age groups (18–25, 26–40, etc).

Bucket songs by duration (short, medium, long).

Create histogram of favoriteSongs count.

Find median duration of songs.

Find top 5 oldest singers.

Calculate user-to-singer ratio by country.

Find correlation: do older users like longer songs?

Compute % of users liking each genre.

Build a recommendation: users who like same songs also like X.