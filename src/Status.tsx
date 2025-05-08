import "./Status.css";

export default function Status(props: { content: string }) {
  return (
    <div className="Status">
      <div className="content">{props.content}</div>
    </div>
  );
}
