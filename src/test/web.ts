import { Rvent, stop, pass, skip, wait, using, fold, move } from '../rvent'

const click = new Rvent<MouseEvent>()
document.addEventListener('click', e => click.emit(e))

const key = new Rvent<KeyboardEvent>()
document.addEventListener('keypress', e => key.emit(e))

click
    .get((e) => {
        console.log(e)
    })
    .do(() => move(key))
    
    .get((e) => {
        console.log(e)
    })