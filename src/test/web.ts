import { Rvent, stop, pass, skip, wait, using, fold } from '../rvent'

const click = new Rvent<MouseEvent>()
document.addEventListener('click', e => click.emit(e))

click
    //.skip(5)
    .do(() => stop)
    .fold(0, (acc) => acc + 1)
    
    .get((e) => {
        console.log(e)
    })
