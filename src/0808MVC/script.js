import Json from js.json 
console.log(Json)
class Model{
  constructor() {
    this.todos = [
      { id: 1, text: 'run a garden', complete: false },
      { id: 2, text: 'Plant a garden', complete: false }
    ]
  }
  addTodo(todo) {
    this.todos = [...this.todos, todo]
  }
  editTodo(id, updatedText) {
    this.todos = this.todos.map(todo => {
      todo.id === id ? { id: todo.id, text: updatedText, complete: todo.complete} : todo
    })
  }
  deleteTodo(id) {
    this.todos = this.todos.fiflter(todo => {
      todo.id !== id
    })
  }
  toggleTodo(id) {
    this.todos = this.todos.map(todo => {
      todo.id === id ? { id: todo.id, text: text, complete: !todo.complete} : todo
    })
  }
}
class View{
  constructor() {
    // The root element
    this.app = this.getElement('#root')

    // The title of the app
    this.title = this.createElement('h1')
    this.title.textContent = 'Todos'

    // The form, with a [type="text"] input, and a submit button
    this.form = this.createElement('form')

    this.input = this.createElement('input')
    this.input.type = 'text'
    this.input.placeholder = 'Add todo'
    this.input.name = 'todo'

    this.submitButton = this.createElement('button')
    this.submitButton.textContent = 'Submit'

    // The visual representation of the todo list
    this.todoList = this.createElement('ul', 'todo-list')

    // Append the input and submit button to the form
    this.form.append(this.input, this.submitButton)

    // Append the title, form, and todo list to the app
    this.app.append(this.title, this.form, this.todoList)
  }
  createElement(tag, className) {
    const element = document.createElement(tag)
    if (className) {
      element.classList.add(className)
    }
    return element
  }
  getElement(selector){
    const element = document.querySelector(selector)
    return element
  }
}
class Controller{
  constructor(model, view) {
    this.model = model
    this.view = view
  }
}
const app = new Controller(new Model(), new View())
console.log(app)
