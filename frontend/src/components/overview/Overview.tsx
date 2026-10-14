import Card from "./components/Card"
import bessimg from './assets/bess.jpg' 
import ev1img from './assets/ev1.jpg'
import ev2img from './assets/ev2.png'
import solarimg from './assets/solar.png'
import "./overview.css"
import { useState } from "react"
export default function Overview() {

    const [solar, useSolar] = useState(0);


    return <div className="ov">
        <div className="topbar">
            <div className="h1">Overview</div>
            <div className="time">12:00 PM</div>
        </div>
        <div className="overview">
            <Card imgSrc={solarimg} imgAlt="solar" title={`${solar}kW`} description="solar production"/>
            <Card imgSrc={bessimg} imgAlt="bess" title="80%" description="solar production"/>
            <Card imgSrc={ev1img} imgAlt="solar" title="24kW" description="solar production"/>
            <Card imgSrc={ev2img} imgAlt="solar" title="24kW" description="solar production"/>
        </div>
    </div>
}