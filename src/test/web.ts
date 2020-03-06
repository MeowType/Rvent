import { Rvent, pass, skip, wait, using, fold } from '../rvent'

const click = new Rvent<MouseEvent>()
document.addEventListener('click', click.emit)

click
    .skip(5)
    .fold(0, (acc) => acc + 1)
    
    .get((e) => {
        console.log(e)
    })
