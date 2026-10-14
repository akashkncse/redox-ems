interface SidebarIconProps {
    imgUrl: string;
}

export default function SidebarIcon({ imgUrl }: SidebarIconProps) {
    return <>
        <div className="si">
            <img src={imgUrl} alt="" />
        </div>
    </>
}