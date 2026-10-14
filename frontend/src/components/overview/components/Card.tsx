import './Card.css';



interface CardProps {
  /** Source URL for the image displayed on the right side */
  imgSrc: string;
  /** Alt text for the image */
  imgAlt?: string;
  /** Text for the first paragraph on the left */
  title: string;
  /** Text for the second paragraph on the left */
  description: string;
}

/**
 * Generic Card component with an image on the right and two stacked paragraphs on the left.
 * The container uses flexbox to horizontally align the content and centers items vertically.
 */
export default function Card({ imgSrc, imgAlt = '', title, description }: CardProps) {
  return (
    <div className="card">
      <div className="card-text">
        <p className="card-title">{title}</p>
        <p className="card-description">{description}</p>
      </div>
      <img className="card-image" src={imgSrc} alt={imgAlt} />
    </div>
  );
}