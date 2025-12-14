// Todo task 
import React, { useState } from "react";

const userTodoData = [
  { name: "do homework", iscomplete: "InProgress", isMatch: true },
  { name: "please do task", iscomplete: "Complete", isMatch: false }
];

function App() {
  const [todoTask, setTodoTask] = useState(userTodoData);

  // Toggle InProgress <-> Complete
  function handleClick(id) {
    setTodoTask((prevTasks) =>
      prevTasks.map((todo, index) =>
        index === id
          ? {
              ...todo,
              iscomplete:
                todo.iscomplete === "InProgress" ? "Complete" : "InProgress"
            }
          : todo
      )
    );
  }

  // Toggle checkbox (isMatch)
  function handleCheck(id) {
    setTodoTask((prevTasks) =>
      prevTasks.map((todo, index) =>
        index === id ? { ...todo, isMatch: !todo.isMatch } : todo
      )
    );
  }

  return (
    <ul>
      {todoTask?.map((todo, index) => (
        <li key={index}>
          {todo.name}{" "}
          <button onClick={() => handleClick(index)}>
            {todo.iscomplete}
          </button>
          <input
            type="checkbox"
            checked={todo.isMatch}
            onChange={() => handleCheck(index)}
          />
        </li>
      ))}
    </ul>
  );
}

export default App;

//// Build a Todo application where a user can:

// Add a new task
// Mark a task as completed (checkbox)
// Edit and delete tasks
// Filter tasks → All, Active, Completed
// Persist tasks in localStorage

 

  
