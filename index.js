import { faker } from "@faker-js/faker";
import { MongoClient, ObjectId } from "mongodb";

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

async function seedData() {
  try {
    await client.connect();
    const db = client.db("musicDB");

    const users = db.collection("users");
    const songs = db.collection("songs");
    const singers = db.collection("singers");

    // ✅ Clear old data
    await users.deleteMany({});
    await songs.deleteMany({});
    await singers.deleteMany({});

    // ✅ Insert some songs
    const insertedSongs = await songs.insertMany(
      Array.from({ length: 1000 }).map(() => ({
        title: faker.music.songName(),
        duration: faker.number.int({ min: 120, max: 400 }),
        genre: faker.music.genre(),
      }))
    );

    // ✅ Insert some singers
    const insertedSingers = await singers.insertMany(
      Array.from({ length: 50 }).map(() => ({
        name: faker.person.fullName(),
        country: faker.location.country(),
      }))
    );

    // ✅ Get real ObjectIds
    const songIds = Object.values(insertedSongs.insertedIds);
    const singerIds = Object.values(insertedSingers.insertedIds);

    // ✅ Create fake users with random songIds & singerIds
    const fakeUsers = Array.from({ length: 1000 }).map(() => {
      const randomFavSongs = faker.helpers.arrayElements(songIds, 10); // pick 4 songs
      const randomFavSinger = faker.helpers.arrayElements(singerIds,5);

      return {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        dob: faker.date.birthdate(),
        mobile: faker.phone.number(),
        email: faker.internet.email(),
        country: faker.location.country(),
        favoriteSongs: randomFavSongs, // ✅ Real ObjectIds
        favoriteSinger: randomFavSinger, // ✅ Real ObjectId
      };
    });

    await users.insertMany(fakeUsers);

    console.log("✅ Database seeded successfully!");
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

seedData();
