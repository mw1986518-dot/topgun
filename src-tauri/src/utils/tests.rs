use super::*;
use std::fs;

#[test]
fn detect_track_for_conceptual_topic() {
    let topic = "\u{8bf7}\u{89e3}\u{91ca}\u{8d1d}\u{53f6}\u{65af}\u{539f}\u{7406}\u{548c}\u{5b83}\u{7684}\u{903b}\u{8f91}\u{8fb9}\u{754c}";
    let track = detect_clarification_track(topic);
    assert_eq!(track, ClarificationTrack::Conceptual);
}

#[test]
fn detect_track_for_practical_topic() {
    let topic = "Q2\u{5ba2}\u{6237}\u{7eed}\u{7ea6}\u{7387}\u{4e0b}\u{964d}\u{ff0c}\u{5982}\u{4f55}\u{5236}\u{5b9a}\u{6267}\u{884c}\u{8ba1}\u{5212}\u{548c}\u{8d1f}\u{8d23}\u{4eba}\u{6392}\u{671f}";
    let track = detect_clarification_track(topic);
    assert_eq!(track, ClarificationTrack::Practical);
}

#[test]
fn round1_fallback_changes_with_topic_track() {
    let conceptual_topic = "\u{8fd9}\u{4e2a}\u{6982}\u{5ff5}\u{7684}\u{5b9a}\u{4e49}\u{8fb9}\u{754c}\u{662f}\u{4ec0}\u{4e48}";
    let practical_topic = "\u{8fd9}\u{4e2a}\u{9879}\u{76ee}\u{5982}\u{4f55}\u{843d}\u{5730}\u{5e76}\u{63a7}\u{5236}\u{6210}\u{672c}";

    let conceptual = build_round1_fallback_questions(conceptual_topic);
    let practical = build_round1_fallback_questions(practical_topic);

    assert_eq!(conceptual.len(), 3);
    assert_eq!(practical.len(), 3);
    assert!(conceptual.iter().any(|q| {
        q.question.contains("\u{5b9a}\u{4e49}") || q.question.contains("\u{6982}\u{5ff5}")
    }));
    assert!(practical.iter().any(|q| {
        q.question.contains("\u{8d44}\u{6e90}") || q.question.contains("\u{7ea2}\u{7ebf}")
    }));
}

#[test]
fn round2_relevance_accepts_conceptual_deep_questions() {
    let topic = "\u{547d}\u{9898}\u{903b}\u{8f91}\u{4e2d}\u{7684}\u{5145}\u{5206}\u{5fc5}\u{8981}\u{6761}\u{4ef6}\u{533a}\u{522b}";
    let question = "\u{4f60}\u{5e0c}\u{671b}\u{7528}\u{54ea}\u{4e9b}\u{5224}\u{636e}\u{754c}\u{5b9a}\u{8be5}\u{6982}\u{5ff5}\u{8fb9}\u{754c}\u{ff0c}\u{907f}\u{514d}\u{903b}\u{8f91}\u{8bef}\u{5224}\u{ff1f}";
    assert!(is_round2_question_relevant(question, topic));
}

#[test]
fn round2_relevance_rejects_generic_non_deep_questions() {
    let topic = "\u{5982}\u{4f55}\u{63d0}\u{5347}\u{9500}\u{552e}\u{8f6c}\u{5316}";
    let question = "\u{4f60}\u{80fd}\u{518d}\u{591a}\u{8bf4}\u{4e00}\u{70b9}\u{5417}\u{ff1f}";
    assert!(!is_round2_question_relevant(question, topic));
}

#[test]
fn round2_relevance_accepts_contextual_follow_up() {
    let topic = "\u{4e24}\u{4e2a}\u{5ba2}\u{6237}\u{90fd}\u{4e0d}\u{613f}\u{610f}\u{7b7e}\u{5e74}\u{5ea6}\u{4fdd}\u{5e95}\u{534f}\u{8bae}\u{ff0c}\u{600e}\u{4e48}\u{63a8}\u{8fdb}\u{6210}\u{4ea4}";
    let question = "\u{4f60}\u{4e0a}\u{4e00}\u{8f6e}\u{63d0}\u{5230}\u{8ba1}\u{5212}\u{5468}\u{671f}\u{5f88}\u{7d27}\u{ff0c}\u{57fa}\u{4e8e}\u{8fd9}\u{4ef6}\u{4e8b}\u{7684}\u{53ef}\u{63a5}\u{53d7}\u{8ba9}\u{6b65}\u{5e95}\u{7ebf}\u{6761}\u{4ef6}\u{662f}\u{4ec0}\u{4e48}\u{ff1f}";
    assert!(is_round2_question_relevant(question, topic));
}

#[test]
fn atomic_write_text_file_replaces_existing_content() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let path = temp_dir.path().join("data.json");

    atomic_write_text_file(&path, r#"{"v":1}"#).expect("first write should succeed");
    atomic_write_text_file(&path, r#"{"v":2}"#).expect("second write should succeed");

    let final_text = fs::read_to_string(&path).expect("result file should be readable");
    assert_eq!(final_text, r#"{"v":2}"#);
}

#[test]
fn move_corrupt_file_moves_original_file() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let path = temp_dir.path().join("history.json");
    fs::write(&path, "broken-json").expect("seed corrupt file should be written");

    let backup = move_corrupt_file(&path, "history-json")
        .expect("move_corrupt_file should succeed")
        .expect("backup path should be returned");

    assert!(!path.exists());
    assert!(backup.exists());
    let backup_content = fs::read_to_string(backup).expect("backup file should be readable");
    assert_eq!(backup_content, "broken-json");
}
